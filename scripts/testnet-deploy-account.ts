/**
 * Fair Squares -- Testnet account bootstrap
 *
 * Creates (or reuses) a Schnorr account on the public Aztec testnet,
 * funded entirely via SponsoredFPC. Persists the secret/salt/address
 * tuple to scripts/.testnet/account.json so the same account is reused
 * across runs (testnet quotas are per-address).
 *
 * Usage:
 *   AZTEC_NETWORK=testnet \
 *   SPONSORED_FPC_ADDRESS=0x... \
 *     npx tsx scripts/testnet-deploy-account.ts
 *
 * Env:
 *   AZTEC_NETWORK         must be "testnet" (guardrail; refuses otherwise).
 *   AZTEC_NODE_URL        PXE endpoint. Defaults to https://rpc.testnet.aztec-labs.com.
 *   SPONSORED_FPC_ADDRESS Address of the SponsoredFPC instance on this
 *                         network. Required. Look it up on
 *                         https://docs.aztec.network/networks (testnet entry).
 *   FS_TESTNET_ACCOUNT    Optional path override for the persisted account file.
 *                         Defaults to scripts/.testnet/account.json.
 *
 * Output:
 *   - scripts/.testnet/account.json   { secret, salt, address }
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
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/foundation/curves/bn254";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

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
  address: string;
};

function loadAccount(): PersistedAccount | null {
  const p = accountFilePath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as PersistedAccount;
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

  const sponsoredFpcAddr = process.env.SPONSORED_FPC_ADDRESS ?? "";
  if (!sponsoredFpcAddr) {
    throw new Error(
      "SPONSORED_FPC_ADDRESS not set. Look up the testnet SponsoredFPC address on https://docs.aztec.network/networks and re-run.",
    );
  }
  const sponsoredFpc = AztecAddress.fromString(sponsoredFpcAddr);

  const pxeUrl =
    process.env.AZTEC_NODE_URL ??
    process.env.PXE_URL ??
    DEFAULT_TESTNET_PXE;

  log(`network = ${network}`);
  log(`pxe     = ${pxeUrl}`);
  log(`fpc     = ${sponsoredFpc.toString()}`);

  const node = createAztecNodeClient(pxeUrl);
  const wallet = await EmbeddedWallet.create(node);

  const existing = loadAccount();
  const secret = existing
    ? Fr.fromString(existing.secret)
    : Fr.random();
  const salt = existing ? Fr.fromString(existing.salt) : Fr.random();

  log(existing ? "reusing persisted account" : "generating new account");

  const manager = await wallet.createSchnorrAccount(secret, salt);
  const address = manager.address;
  log(`address = ${address.toString()}`);

  // If we already have the persisted file *and* the network already knows
  // the contract, we can short-circuit. Otherwise, attempt deploy via the
  // sponsored payment method.
  const isDeployed = await node
    .getContractClass((await manager.getInstance()).contractClassId)
    .catch(() => null);

  if (!existing || !isDeployed) {
    log("deploying account via SponsoredFPC...");
    const deployMethod = await manager.getDeployMethod();
    const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFpc);
    const sent = await deployMethod.send({
      fee: { paymentMethod },
    } as never);
    const receipt = await (sent as { wait: () => Promise<{ txHash: string }> }).wait();
    log(`deploy tx = ${receipt.txHash ?? "(no hash)"}`);

    saveAccount({
      secret: secret.toString(),
      salt: salt.toString(),
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
