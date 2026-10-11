/**
 * Fair Squares -- V2 seed deposit
 *
 * Runs after bootstrap-local-network.sh has issued private KYC
 * credentials and minted EUR to the test accounts. Connects to the
 * local PXE as test0, fetches its KycCredentialNote hint from PXE,
 * and calls HousingFund.deposit_private(amount, hint) so the V2 path
 * is exercised end-to-end at boot.
 *
 * This replaces the legacy public HousingFund.deposit step in the
 * bootstrap. The EUR transfer to the housing fund still happens
 * publicly via the bootstrap shell (EUR is a stablecoin shadow); the
 * V2 privacy gain is on the fund-position side, where each user's
 * deposit becomes a private DepositNote instead of a public ticket.
 *
 * Usage (called from bootstrap-local-network.sh; can also run standalone):
 *   AZTEC_NODE_URL=http://localhost:8080 \
 *   NEXT_PUBLIC_HOUSING_FUND_ADDRESS=0x... \
 *   NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=0x... \
 *   SEED_AMOUNT=500000 \
 *   npx tsx scripts/seed-v2-deposit.ts
 */

import * as fs from "fs";
import * as path from "path";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

const NODE_URL =
  process.env.AZTEC_NODE_URL ?? process.env.PXE_URL ?? "http://localhost:8080";
const KYC_ADDR = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
const HF_ADDR = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
const SEED_AMOUNT = BigInt(process.env.SEED_AMOUNT ?? "500000");

function log(msg: string) {
  console.log(`[seed-v2-deposit] ${msg}`);
}

function loadArtifact(name: string): Parameters<typeof loadContractArtifact>[0] {
  // Generated artifacts produced by bootstrap live in frontend/src/artifacts.
  const candidates = [
    path.resolve(__dirname, `../frontend/src/artifacts/${name}.json`),
    path.resolve(__dirname, `../contracts/${name.split("-")[0]}/target/${name}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(
    `Could not locate artifact for ${name}. Tried:\n  ${candidates.join("\n  ")}`
  );
}

async function main() {
  if (!KYC_ADDR) throw new Error("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set");
  if (!HF_ADDR) throw new Error("NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set");

  log(`node = ${NODE_URL}`);
  log(`kyc  = ${KYC_ADDR}`);
  log(`hf   = ${HF_ADDR}`);
  log(`amount = ${SEED_AMOUNT}`);

  const node = createAztecNodeClient(NODE_URL);
  const wallet = await EmbeddedWallet.create(node);

  // test0 is the canned admin account that bootstrap already KYC'd and
  // issued a credential to. We use the same wallet so the credential
  // note is in this PXE.
  const [test0] = await getInitialTestAccountsData();
  // Pass signingKey (3rd arg) so the derived address matches the bootstrap /
  // serverWallet test0 (which was KYC'd). Omitting it derives a DIFFERENT
  // address with no KYC credential, so get_my_kyc_credentials would find none.
  const account = await wallet.createSchnorrAccount(test0.secret, test0.salt, test0.signingKey);
  const accountAddress = account.address;
  log(`test0 = ${accountAddress.toString()}`);

  const kycArtifact = loadContractArtifact(
    loadArtifact("kyc_verifier-KYCVerifier")
  );
  const hfArtifact = loadContractArtifact(
    loadArtifact("housing_fund-HousingFund")
  );

  // Contract.at does NOT register the contract in PXE — it just builds the
  // method proxy. EmbeddedWallet ships with its own in-process PXE which has
  // no knowledge of contracts deployed via the aztec-wallet CLI, so we have
  // to fetch the instance from the node and register it before simulating.
  const kycAddress = AztecAddress.fromStringUnsafe(KYC_ADDR);
  const hfAddress = AztecAddress.fromStringUnsafe(HF_ADDR);
  const kycInstance = await node.getContract(kycAddress);
  const hfInstance = await node.getContract(hfAddress);
  if (!kycInstance) throw new Error(`KYCVerifier ${KYC_ADDR} not on node`);
  if (!hfInstance) throw new Error(`HousingFund ${HF_ADDR} not on node`);
  await wallet.registerContract(kycInstance, kycArtifact);
  await wallet.registerContract(hfInstance, hfArtifact);

  const kyc = await Contract.at(kycAddress, kycArtifact, wallet);
  const hf = await Contract.at(hfAddress, hfArtifact, wallet);

  log("simulating KYCVerifier.get_my_kyc_credentials...");
  const credsResult = (await kyc.methods
    .get_my_kyc_credentials(accountAddress, 0)
    .simulate({ from: accountAddress })) as unknown as {
    len: bigint;
    storage: unknown[];
  };
  if (credsResult.len === 0n) {
    throw new Error(
      "No private KycCredentialNote found for test0. Did bootstrap call KYCVerifier.issue_credential first?"
    );
  }
  log(`  -> found ${credsResult.len} credential(s)`);
  const hintedKycNote = credsResult.storage[0];

  // Phase 3: deposit_private stamps the deposit's immutable FIFO interval
  // (cum_before), global seq, and frozen small bit. Read the live public cursor
  // and supply them; the contract's only_self tail re-verifies them.
  log("reading HousingFund.get_deposit_cursor_unconstrained...");
  const cursor = (await hf.methods
    .get_deposit_cursor_unconstrained()
    .simulate({ from: accountAddress })) as unknown as {
    cum_deposits: bigint;
    cum_small_deposits: bigint;
    deposit_seq: bigint;
    small_threshold: bigint;
  };
  const suppliedCumBefore = BigInt(cursor.cum_deposits);
  const suppliedSeq = BigInt(cursor.deposit_seq);
  const suppliedIsSmall = SEED_AMOUNT <= BigInt(cursor.small_threshold);
  log(
    `  -> cursor: cum_before=${suppliedCumBefore} seq=${suppliedSeq} ` +
      `is_small=${suppliedIsSmall} (threshold=${cursor.small_threshold})`
  );

  log("sending HousingFund.deposit_private...");
  await hf.methods
    .deposit_private(SEED_AMOUNT, hintedKycNote, suppliedCumBefore, suppliedSeq, suppliedIsSmall)
    .send({ from: accountAddress });

  log(`✅ V2 seed deposit of ${SEED_AMOUNT} EUR landed as a private DepositNote for test0`);
}

main().catch((err) => {
  console.error("[seed-v2-deposit] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
