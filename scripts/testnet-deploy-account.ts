/**
 * Fair Squares -- Testnet account bootstrap
 *
 * Creates (or reuses) a Schnorr account on the public Aztec testnet,
 * funded entirely via SponsoredFPC. Persists the secret/salt/address
 * tuple to scripts/.testnet/account.json so the same account is reused
 * across runs (testnet quotas are per-address).
 *
 * The SponsoredFPC address is derived deterministically from the
 * upstream artifact + salt=0 (canonical deployment on every Aztec
 * network); no env lookup needed.
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-account.ts
 *
 * Env:
 *   AZTEC_NETWORK         must be "testnet" (guardrail; refuses otherwise).
 *   AZTEC_NODE_URL        PXE endpoint. Defaults to https://rpc.testnet.aztec-labs.com.
 *   FS_TESTNET_ACCOUNT    Optional path override for the persisted account file.
 *                         Defaults to scripts/.testnet/account.json.
 *
 * Output:
 *   - scripts/.testnet/account.json   { secret, salt, signingKey, address }
 *   - prints the deployed address on stdout.
 *
 * Notes:
 *   - The persisted file contains the account secret in plaintext.
 *     scripts/.testnet/ is gitignored. Do not commit this file.
 *   - First run pays a sponsored deploy tx; subsequent runs short-circuit
 *     after registering the existing instance with the local PXE.
 */

import * as fs from "fs";
import * as path from "path";
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/aztec.js/contracts";
import { NO_FROM } from "@aztec-labs/aztec.js/account";
import { SponsoredFeePaymentMethod } from "@aztec-labs/aztec.js/fee";
import { Fq, Fr } from "@aztec-labs/foundation/curves/bn254";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import { SponsoredFPCContract } from "@aztec-labs/noir-contracts.js/SponsoredFPC";

const DEFAULT_TESTNET_PXE = "https://rpc.testnet.aztec-labs.com";

function log(msg: string) {
  console.log(`[testnet-deploy-account] ${msg}`);
}

function accountFilePath(): string {
  if (process.env.FS_TESTNET_ACCOUNT) return process.env.FS_TESTNET_ACCOUNT;
  return path.resolve(__dirname, ".testnet", "account.json");
}

type PersistedAccount = {
  secret: string;
  salt: string;
  // Aztec >= 5: the Schnorr signing key is the account root and is no longer
  // derivable from `secret`, so it is persisted alongside it.
  signingKey: string;
  address: string;
};

function loadAccount(): PersistedAccount | null {
  const p = accountFilePath();
  if (!fs.existsSync(p)) return null;
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<PersistedAccount>;
  if (!parsed.secret || !parsed.salt || !parsed.address) {
    throw new Error(`Malformed account file ${p}`);
  }
  if (!parsed.signingKey) {
    // Pre-v5 file (secret-derived signing key). Its address cannot be
    // reproduced on an Aztec >= 5 network, so start over rather than
    // silently deploying a different account under the old file.
    throw new Error(
      `${p} predates Aztec 5 (no signingKey). Delete it and re-run to create a fresh account.`,
    );
  }
  return parsed as PersistedAccount;
}

function saveAccount(a: PersistedAccount): void {
  const p = accountFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(a, null, 2));
  log(`persisted ${p}`);
}

async function main() {
  const network = (process.env.AZTEC_NETWORK ?? "").toLowerCase();
  if (network !== "testnet") {
    throw new Error(
      `AZTEC_NETWORK must be "testnet" (got "${network}"). This script is a guardrail-only path that intentionally refuses local-network runs.`,
    );
  }

  const pxeUrl =
    process.env.AZTEC_NODE_URL ??
    process.env.PXE_URL ??
    DEFAULT_TESTNET_PXE;

  log(`network = ${network}`);
  log(`pxe     = ${pxeUrl}`);

  const node = createAztecNodeClient(pxeUrl);
  const wallet = await EmbeddedWallet.create(node);

  // Derive the canonical SponsoredFPC address (salt=0). The contract
  // is pre-deployed by network ops on every Aztec network (testnet,
  // devnet, local-network) at this deterministic address.
  const sponsoredFpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  await wallet.registerContract(
    sponsoredFpcInstance,
    SponsoredFPCContract.artifact,
  );
  const sponsoredFpc = sponsoredFpcInstance.address;
  log(`fpc     = ${sponsoredFpc.toString()} (derived from artifact, salt=0)`);

  const existing = loadAccount();
  const secret = existing
    ? Fr.fromString(existing.secret)
    : Fr.random();
  const salt = existing ? Fr.fromString(existing.salt) : Fr.random();
  const signingKey = existing ? Fq.fromString(existing.signingKey) : Fq.random();

  log(existing ? "reusing persisted account" : "generating new account");

  const manager = await wallet.createSchnorrAccount(secret, salt, signingKey);
  const address = manager.address;
  log(`address = ${address.toString()}`);

  // If we already have the persisted file *and* the network already knows
  // the contract, we can short-circuit. Otherwise, attempt deploy via the
  // sponsored payment method.
  const isDeployed = await node
    .getContractClass((await manager.getInstance()).currentContractClassId)
    .catch(() => null);

  if (!existing || !isDeployed) {
    log("deploying account via SponsoredFPC...");
    const deployMethod = await manager.getDeployMethod();
    const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFpc);
    // send() waits for mining by default and returns the receipt.
    // An account deploys itself: there is no sender account yet (NO_FROM).
    const { receipt } = await deployMethod.send({ from: NO_FROM, fee: { paymentMethod } });
    log(`deploy tx = ${receipt.txHash.toString()}`);

    saveAccount({
      secret: secret.toString(),
      salt: salt.toString(),
      signingKey: signingKey.toString(),
      address: address.toString(),
    });
  } else {
    log("account already deployed; skipping send");
  }

  log("");
  log("Next milestones (Stage 6.5):");
  log("  1. testnet-deploy-contracts.ts -- deploy 7 Fair Squares contracts");
  log("     reusing this account as deployer/admin.");
  log("  2. Emit frontend/.env.testnet with NEXT_PUBLIC_*_ADDRESS keys.");
  log("  3. smoke-testnet-flow.ts -- end-to-end happy path.");
  log("");
  log(`✅ account ready: ${address.toString()}`);
}

main().catch((err) => {
  console.error(
    "[testnet-deploy-account] FAILED:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
