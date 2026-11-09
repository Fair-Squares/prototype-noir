/**
 * Fair Squares -- Testnet private-flow smoke test (aztec v6)
 *
 * Exercises the EVERYDAY private deposit path against the contracts deployed by
 * testnet-deploy-contracts.ts and asserts the privacy posture it is meant to
 * have:
 *
 *   1. Dripper.drip_to_public(EUR, amount)            -- public EUR faucet
 *   2. EUR.transfer_public_to_public(me, fund, amount)  -- public settlement leg
 *   3. HousingFund.deposit_private(amount, kycHint, ...) -- PRIVATE position
 *
 * Then it checks, with real on-chain reads:
 *   - the depositor's PXE holds a new DepositNote (private, owner-scoped read),
 *   - the fund's aggregate total_deposits moved by exactly `amount`,
 *   - the PUBLIC investor registry did NOT gain an entry (investor_count
 *     unchanged) -- a private deposit never writes the caller's address to
 *     public state (see CLAUDE.md "Privacy model").
 *
 * Every send is checked for a post-mining revert. Fees are paid by the
 * canonical SponsoredFPC; proofs are real (testnet).
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/testnet-smoke-flow.ts
 * Env:  SMOKE_AMOUNT (default 1000 EUR, whole units; the fund's small-deposit
 *       threshold is 10000 so this is a "small" deposit).
 */

import * as fs from "fs";
import * as path from "path";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { Fr, GrumpkinScalar } from "@aztec-labs/aztec.js/fields";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import {
  assertNodeVersion,
  loadPersistedAccount,
  requireTestnet,
  sponsoredFeeMethod,
  testnetNodeClient,
} from "./testnet-deploy-account";

const ROOT = path.resolve(__dirname, "..");
const WAIT_TIMEOUT_SECONDS = Number(process.env.FS_TESTNET_TX_TIMEOUT ?? "900");
const AMOUNT = BigInt(process.env.SMOKE_AMOUNT ?? "1000");

function log(msg: string) {
  console.log(`[testnet-smoke-flow] ${msg}`);
}

function readArtifact(p: string) {
  if (!fs.existsSync(p)) throw new Error(`Artifact missing: ${p} (run ./scripts/compile-contracts.sh)`);
  return loadContractArtifact(JSON.parse(fs.readFileSync(p, "utf8")) as Parameters<typeof loadContractArtifact>[0]);
}

/** simulate() resolves to { result, offchainEffects, ... } in aztec.js 6.x. */
function simValue<T>(sim: unknown): T {
  if (sim && typeof sim === "object" && "result" in (sim as Record<string, unknown>)) {
    return (sim as { result: T }).result;
  }
  return sim as T;
}

function assertNotReverted(label: string, result: unknown): void {
  const top = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const inner = (top.receipt as Record<string, unknown> | undefined) ?? top;
  const execResult = inner.executionResult;
  if (typeof execResult === "string" && execResult.toLowerCase() === "reverted") {
    throw new Error(`${label} was mined but REVERTED: ${String(inner.error ?? "unknown")}`);
  }
}

async function main() {
  const nodeUrl = requireTestnet();
  const deployed = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, ".testnet", "contracts.json"), "utf8"),
  ) as { contracts: Record<string, string> };
  const persisted = loadPersistedAccount();
  if (!persisted) throw new Error("No scripts/.testnet/account.json -- run testnet-deploy-account.ts first.");

  const node = testnetNodeClient(nodeUrl);
  await assertNodeVersion(node);
  const wallet = await EmbeddedWallet.create(node, { pxe: { proverEnabled: true } });
  const paymentMethod = await sponsoredFeeMethod(wallet);
  const manager = await wallet.createSchnorrAccount(
    Fr.fromString(persisted.secret),
    Fr.fromString(persisted.salt),
    GrumpkinScalar.fromString(persisted.signingKey),
  );
  const me = manager.address;
  log(`account = ${me.toString()}`);

  // Register the deployed instances in this PXE (needed before simulate/send).
  async function attach(label: string, address: string, artifactPath: string) {
    const addr = AztecAddress.fromStringUnsafe(address);
    const instance = await node.getContract(addr);
    if (!instance) throw new Error(`${label} ${address} is not registered on the node`);
    const artifact = readArtifact(artifactPath);
    await wallet.registerContract(instance, artifact);
    return Contract.at(addr, artifact, wallet);
  }
  const std = path.resolve(ROOT, "contracts", "vendor", "aztec-standards", "target");
  const hf = await attach("HousingFund", deployed.contracts.housing_fund, path.resolve(ROOT, "contracts/housing_fund/target/housing_fund-HousingFund.json"));
  const kyc = await attach("KYCVerifier", deployed.contracts.kyc_verifier, path.resolve(ROOT, "contracts/kyc_verifier/target/kyc_verifier-KYCVerifier.json"));
  const eur = await attach("EUR", deployed.contracts.eur_token, path.resolve(std, "token_contract-Token.json"));
  const dripper = await attach("Dripper", deployed.contracts.dripper, path.resolve(std, "dripper-Dripper.json"));
  const fundAddr = AztecAddress.fromStringUnsafe(deployed.contracts.housing_fund);
  const eurAddr = AztecAddress.fromStringUnsafe(deployed.contracts.eur_token);
  const sendOpts = { from: me, fee: { paymentMethod }, wait: { timeout: WAIT_TIMEOUT_SECONDS } };

  // -- Baseline reads -------------------------------------------------------
  const totalBefore = BigInt(simValue<bigint>(await hf.methods.get_total_deposits().simulate({ from: me })));
  const investorsBefore = Number(simValue<bigint>(await hf.methods.get_investor_count().simulate({ from: me })));
  const notesBefore = simValue<{ len: bigint }>(await hf.methods.get_my_deposit_notes(me, 0).simulate({ from: me }));
  log(`baseline: total_deposits=${totalBefore} investor_count=${investorsBefore} my_deposit_notes=${notesBefore.len}`);

  // -- 1 + 2: public EUR faucet + public settlement leg ------------------------
  log(`drip ${AMOUNT} EUR (public) ...`);
  assertNotReverted("drip_to_public", await dripper.methods.drip_to_public(eurAddr, AMOUNT).send(sendOpts));
  log(`transfer ${AMOUNT} EUR -> fund (public) ...`);
  assertNotReverted(
    "transfer_public_to_public",
    await eur.methods.transfer_public_to_public(me, fundAddr, AMOUNT, 0).send(sendOpts),
  );

  // -- 3: PRIVATE deposit with the hinted KYC credential ------------------------
  const creds = simValue<{ len: bigint; storage: unknown[] }>(
    await kyc.methods.get_my_kyc_credentials(me, 0).simulate({ from: me }),
  );
  if (BigInt(creds.len) < 1n) throw new Error("no private KycCredentialNote in this PXE (issue_credential missing?)");
  const cursor = simValue<{ cum_deposits: bigint; deposit_seq: bigint; small_threshold: bigint }>(
    await hf.methods.get_deposit_cursor_unconstrained().simulate({ from: me }),
  );
  const isSmall = AMOUNT <= BigInt(cursor.small_threshold);
  log(`deposit_private(${AMOUNT}) with KYC hint; cursor cum_before=${cursor.cum_deposits} seq=${cursor.deposit_seq} is_small=${isSmall} ...`);
  assertNotReverted(
    "deposit_private",
    await hf.methods
      .deposit_private(AMOUNT, creds.storage[0], BigInt(cursor.cum_deposits), BigInt(cursor.deposit_seq), isSmall)
      .send(sendOpts),
  );

  // -- Assertions ---------------------------------------------------------------
  const totalAfter = BigInt(simValue<bigint>(await hf.methods.get_total_deposits().simulate({ from: me })));
  const investorsAfter = Number(simValue<bigint>(await hf.methods.get_investor_count().simulate({ from: me })));
  const notesAfter = simValue<{ len: bigint }>(await hf.methods.get_my_deposit_notes(me, 0).simulate({ from: me }));
  log(`after: total_deposits=${totalAfter} investor_count=${investorsAfter} my_deposit_notes=${notesAfter.len}`);

  const failures: string[] = [];
  if (totalAfter !== totalBefore + AMOUNT) failures.push(`total_deposits moved by ${totalAfter - totalBefore}, expected ${AMOUNT}`);
  if (BigInt(notesAfter.len) !== BigInt(notesBefore.len) + 1n) failures.push(`deposit notes went ${notesBefore.len} -> ${notesAfter.len}, expected +1`);
  if (investorsAfter !== investorsBefore) failures.push(`PUBLIC investor_count changed (${investorsBefore} -> ${investorsAfter}) on a PRIVATE deposit`);
  if (failures.length) throw new Error(`privacy/state assertions failed:\n  - ${failures.join("\n  - ")}`);

  log("PASS -- private deposit landed on testnet: a new owner-scoped DepositNote, total_deposits += amount,");
  log("        and the public investor registry did not learn the depositor's address.");
}

main().catch((err) => {
  console.error("[testnet-smoke-flow] FAILED:", err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
