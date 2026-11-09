/**
 * Fair Squares -- Testnet account bootstrap (aztec v6)
 *
 * Creates (or reuses) a Schnorr account on the public Aztec testnet, funded
 * entirely via the canonical SponsoredFPC. Persists the account's keys to
 * scripts/.testnet/account.json so the same account is reused across runs
 * (testnet sponsorship quotas are per-address).
 *
 * v6 notes (see docs migration notes 5.0.0 / 6.0.0-rc.1):
 *   - A Schnorr account is now ROOTED on its signing key; the privacy secret is
 *     derived from it. We persist `signingKey` + `secret` + `salt` + `address`.
 *   - SponsoredFPC's canonical address derives from its artifact at
 *     SPONSORED_FPC_SALT (from @aztec-labs/constants) -- no env lookup needed.
 *   - Proofs are REQUIRED on testnet (ClientIVC, ~minutes/tx on first run while
 *     proving keys download). The PXE store persists under scripts/aztec-wallet-data/.
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-account.ts
 *
 * Env:
 *   AZTEC_NETWORK         must be "testnet" (guardrail; refuses otherwise).
 *   AZTEC_NODE_URL        node RPC. Defaults to https://aztec-testnet.drpc.org
 *                         (the URL on https://docs.aztec.network/networks).
 *   FS_TESTNET_ACCOUNT    Optional path override for the persisted account file.
 *                         Defaults to scripts/.testnet/account.json.
 *
 * Output:
 *   - scripts/.testnet/account.json   { signingKey, secret, salt, address }
 *   - prints the deployed address on stdout.
 *
 * The persisted file contains the account's keys in plaintext. scripts/.testnet/
 * is gitignored. Do not commit this file.
 */

import * as fs from "fs";
import * as path from "path";
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/aztec.js/contracts";
import { SponsoredFeePaymentMethod } from "@aztec-labs/aztec.js/fee";
import { NO_FROM } from "@aztec-labs/aztec.js/account";
import { Fr, GrumpkinScalar } from "@aztec-labs/aztec.js/fields";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import { SponsoredFPCContract } from "@aztec-labs/noir-contracts.js/SponsoredFPC";
import { SPONSORED_FPC_SALT } from "@aztec-labs/constants";

/** The toolchain / SDK version this repo is pinned to. Testnet is version-locked. */
export const PINNED_AZTEC_VERSION = "6.0.0";
export const DEFAULT_TESTNET_NODE_URL = "https://aztec-testnet.drpc.org";

function log(msg: string) {
  console.log(`[testnet-deploy-account] ${msg}`);
}

export function accountFilePath(): string {
  if (process.env.FS_TESTNET_ACCOUNT) return process.env.FS_TESTNET_ACCOUNT;
  return path.resolve(__dirname, ".testnet", "account.json");
}

export type PersistedAccount = {
  signingKey: string;
  secret: string;
  salt: string;
  address: string;
  /** Hash of the (sponsored) account deployment tx, once sent. */
  deployTxHash?: string;
};

/** True when the node reports the tx as mined (any post-mining status). */
export async function txIsMined(node: ReturnType<typeof createAztecNodeClient>, txHash: string): Promise<boolean> {
  const { TxHash } = await import("@aztec-labs/aztec.js/tx");
  const receipt = (await node.getTxReceipt(TxHash.fromString(txHash))) as unknown as {
    status?: string;
    executionResult?: string;
  };
  const status = String(receipt?.status ?? "").toLowerCase();
  if (["proposed", "checkpointed", "proven", "finalized"].includes(status)) {
    if (receipt.executionResult && receipt.executionResult.toLowerCase() === "reverted") {
      throw new Error(`tx ${txHash} was mined but REVERTED`);
    }
    return true;
  }
  return false;
}

export function loadPersistedAccount(): PersistedAccount | null {
  const p = accountFilePath();
  if (!fs.existsSync(p)) return null;
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<PersistedAccount>;
  if (!parsed.signingKey || !parsed.secret || !parsed.salt || !parsed.address) {
    throw new Error(
      `${p} is a pre-v6 account file (missing signingKey). v6 accounts are rooted on the ` +
        `signing key and derive a different address; move the old file aside and re-run.`,
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

/**
 * Node client for the public testnet. Public RPC providers cap JSON-RPC batch
 * sizes (dRPC's free tier rejects batches of more than 3 requests with
 * "Batch of more than 3 requests are not allowed on free plan"), and the v6
 * PXE prover fires 4-request batches while proving, so cap the client's batch
 * size (FS_RPC_MAX_BATCH, default 3; 1 disables batching).
 */
export function testnetNodeClient(url: string): ReturnType<typeof createAztecNodeClient> {
  const maxBatchSize = Number(process.env.FS_RPC_MAX_BATCH ?? "3");
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new Error(`FS_RPC_MAX_BATCH must be a positive integer (got "${process.env.FS_RPC_MAX_BATCH}")`);
  }
  return createAztecNodeClient(url, { maxBatchSize });
}

export function requireTestnet(): string {
  const network = (process.env.AZTEC_NETWORK ?? "").toLowerCase();
  if (network !== "testnet") {
    throw new Error(
      `AZTEC_NETWORK must be "testnet" (got "${network}"). This script intentionally refuses local-network runs.`,
    );
  }
  return process.env.AZTEC_NODE_URL ?? process.env.PXE_URL ?? DEFAULT_TESTNET_NODE_URL;
}

/** Refuse to talk to a node on a different version: testnet is version-locked. */
export async function assertNodeVersion(node: ReturnType<typeof createAztecNodeClient>): Promise<void> {
  const info = await node.getNodeInfo();
  log(`node version = ${info.nodeVersion} | l1 chain = ${info.l1ChainId} | rollup = ${info.rollupVersion}`);
  if (info.nodeVersion !== PINNED_AZTEC_VERSION) {
    throw new Error(
      `Node runs aztec ${info.nodeVersion} but this repo is pinned to ${PINNED_AZTEC_VERSION}. ` +
        `Bump the pins (aztec-up install, @aztec-labs/* packages, Nargo.toml tags) to match before deploying.`,
    );
  }
}

/** Register the canonical SponsoredFPC in the wallet's PXE and return a fee method for it. */
export async function sponsoredFeeMethod(wallet: EmbeddedWallet): Promise<SponsoredFeePaymentMethod> {
  const instance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
  await wallet.registerContract(instance, SponsoredFPCContract.artifact);
  log(`fpc     = ${instance.address.toString()} (canonical SponsoredFPC, salt=${SPONSORED_FPC_SALT})`);
  return new SponsoredFeePaymentMethod(instance.address);
}

async function main() {
  const nodeUrl = requireTestnet();
  log(`network = testnet`);
  log(`node    = ${nodeUrl}`);

  const node = testnetNodeClient(nodeUrl);
  await assertNodeVersion(node);

  // Persistent (non-ephemeral) stores so the PXE keeps its synced state between
  // runs; proving ON (required on testnet).
  const wallet = await EmbeddedWallet.create(node, { pxe: { proverEnabled: true } });
  const paymentMethod = await sponsoredFeeMethod(wallet);

  const existing = loadPersistedAccount();
  const signingKey = existing ? GrumpkinScalar.fromString(existing.signingKey) : GrumpkinScalar.random();
  const secret = existing ? Fr.fromString(existing.secret) : Fr.random();
  const salt = existing ? Fr.fromString(existing.salt) : Fr.random();
  log(existing ? "reusing persisted account" : "generating new account");

  const manager = await wallet.createSchnorrAccount(secret, salt, signingKey);
  const address = manager.address;
  log(`address = ${address.toString()}`);
  if (existing && existing.address.toLowerCase() !== address.toString().toLowerCase()) {
    throw new Error(
      `Persisted address ${existing.address} does not match the derived ${address.toString()} -- ` +
        `the account file predates the current protocol version (addresses rotate on upgrades). Move it aside.`,
    );
  }

  // NOTE: an account contract is NOT publicly deployed (its instance is
  // initialized privately), so `node.getContract(address)` stays null even
  // after a successful deploy. Deployment is tracked by the persisted tx hash.
  let deployTxHash = existing?.deployTxHash;
  if (deployTxHash && (await txIsMined(node, deployTxHash))) {
    log(`account already deployed on testnet (tx ${deployTxHash}); nothing to do`);
  } else {
    log("deploying account via SponsoredFPC (proving; first run downloads proving keys, allow several minutes)...");
    const deployMethod = await manager.getDeployMethod();
    const result = await deployMethod.send({
      from: NO_FROM,
      fee: { paymentMethod },
      wait: { timeout: 900 },
    });
    const receipt = (result as { receipt?: { txHash?: { toString(): string } } }).receipt;
    const hash = receipt?.txHash?.toString();
    if (!hash) throw new Error("account deploy returned no tx hash");
    if (!(await txIsMined(node, hash))) throw new Error(`account deploy tx ${hash} not mined`);
    deployTxHash = hash;
    log(`deploy tx = ${hash} (mined)`);
  }

  saveAccount({
    signingKey: signingKey.toString(),
    secret: secret.toString(),
    salt: salt.toString(),
    address: address.toString(),
    deployTxHash,
  });

  log("");
  log("Next: AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-contracts.ts");
  log(`account ready: ${address.toString()}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[testnet-deploy-account] FAILED:", err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
