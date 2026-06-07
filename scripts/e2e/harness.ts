/**
 * Fair Squares -- TS aztec.js E2E harness (W3a)
 *
 * A minimal, standalone harness for exercising the contracts' PRIVATE
 * (hinted-note) flows against the RUNNING docker local-network node. These
 * flows cannot be covered by Noir `aztec test` (TestEnvironment can only hint a
 * note at a known storage slot, not a *contract-created* note); upstream Aztec
 * covers the equivalent shape (claim_contract / crowdfunding) only via a TS
 * aztec.js e2e. See docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md (W3a).
 *
 * The connection recipe mirrors the already-proven scripts/seed-v2-deposit.ts:
 * an in-process EmbeddedWallet over a node client, the three canonical Schnorr
 * test accounts, and node.getContract + registerContract before any
 * simulate/send (EmbeddedWallet's PXE doesn't know CLI-deployed contracts).
 *
 * Run AFTER the docker stack's aztec-bootstrap container has exited 0, on a
 * quiet host (no concurrent host-side `aztec compile`/`aztec test` -- the
 * bind-mount race truncates the contracts target dirs). See scripts/e2e/README.md.
 */

import * as fs from "fs";
import * as path from "path";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { loadContractArtifact } from "@aztec/aztec.js/abi";
import { Contract } from "@aztec/aztec.js/contracts";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

export const NODE_URL =
  process.env.AZTEC_NODE_URL ?? process.env.PXE_URL ?? "http://localhost:8080";

export function log(tag: string, msg: string): void {
  console.log(`[${tag}] ${msg}`);
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(
      `${key} not set. Load frontend/.env.local before running -- see scripts/e2e/README.md`,
    );
  }
  return v;
}

/** Resolve a generated artifact JSON: prefer the build-generated frontend copy
 *  (NOT the per-contract target dir, which the docker bootstrap races on). */
function loadRawArtifact(name: string): Parameters<typeof loadContractArtifact>[0] {
  const candidates = [
    path.resolve(__dirname, `../../frontend/src/artifacts/${name}.json`),
    path.resolve(__dirname, `../../contracts/${name.split("-")[0]}/target/${name}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  throw new Error(
    `Could not locate artifact for ${name}. Tried:\n  ${candidates.join("\n  ")}`,
  );
}

export interface Harness {
  node: AztecNode;
  wallet: EmbeddedWallet;
  /** [test0, test1, test2] -- test0 is the bootstrap admin. */
  addresses: AztecAddress[];
}

export async function connect(): Promise<Harness> {
  log("harness", `connecting to ${NODE_URL} ...`);
  const node = createAztecNodeClient(NODE_URL);
  // ephemeral:true => in-memory PXE stores (no on-disk pxe_data dir, which also
  // avoids EACCES when run from a dir the wallet can't write). proverEnabled:false
  // matches the docker node (PXE_PROVER_ENABLED=false) -- skips ~4s/tx proving.
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxe: { proverEnabled: false },
  } as unknown as Parameters<typeof EmbeddedWallet.create>[1]);
  // Match bootstrap / serverWallet WALLET_MIN_FEE_PADDING -- local fee spikes
  // otherwise trip maxFeesPerGas >= gasFees and revert sends.
  (wallet as unknown as { setMinFeePadding?: (n: number) => void }).setMinFeePadding?.(30);

  const data = await getInitialTestAccountsData();
  const addresses: AztecAddress[] = [];
  for (const a of data) {
    // CRITICAL: pass signingKey (3rd arg) so the derived address matches the
    // bootstrap-seeded test account (KYC'd, funded). Omitting it derives a
    // DIFFERENT address with no credential/EUR (seed-v2-deposit.ts:75-79).
    const acct = await wallet.createSchnorrAccount(a.secret, a.salt, a.signingKey);
    addresses.push(acct.address);
  }
  // NOTE on cross-PXE note discovery: a fresh ephemeral PXE rediscovers the KYC
  // credential issued at bootstrap (get_my_kyc_credentials -> 1) but NOT a
  // DepositNote minted by another process's PXE (get_my_deposit_notes -> 0).
  // So flows that need a deposit note CREATE it in-process via deposit_private
  // (using the discoverable KYC hint) -- the same self-contained pattern flow #1
  // uses for its reward note. Don't rely on reading another PXE's deposit notes.
  log("harness", `accounts: ${addresses.map((a) => a.toString().slice(0, 10)).join(", ")}`);
  return { node, wallet, addresses };
}

/** Fetch a deployed instance from the node, register it in the wallet's PXE
 *  (mandatory before simulate/send), and return a method-bound Contract. */
export async function loadContract(
  h: Harness,
  address: string,
  artifactName: string,
): Promise<Contract> {
  const addr = AztecAddress.fromString(address);
  const instance = await h.node.getContract(addr);
  if (!instance) throw new Error(`${artifactName} ${address} not deployed on node ${NODE_URL}`);
  const artifact = loadContractArtifact(loadRawArtifact(artifactName));
  await h.wallet.registerContract(instance, artifact);
  return Contract.at(addr, artifact, h.wallet);
}

/** Tolerant unwrap of a 4.3.0 simulate() result: returns `result` when the
 *  call resolves to a `{ result, offchainEffects, offchainMessages }` wrapper
 *  (aztecSim.ts), else the value directly (seed-v2-deposit.ts). */
export function simValue<T = unknown>(sim: unknown): T {
  if (sim && typeof sim === "object" && "result" in (sim as Record<string, unknown>)) {
    return (sim as { result: T }).result;
  }
  return sim as T;
}

/** Replicates frontend getAztecTxOutcome: a default send() AWAITS inclusion and
 *  RESOLVES even when the public tail reverts post-mining -- the revert lives in
 *  `executionResult` / `error`, not a throw. Callers MUST inspect this. */
export function txReverted(receipt: unknown): { reverted: boolean; error: string | null } {
  const top = receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : {};
  const inner =
    (top.receipt as Record<string, unknown> | undefined) ??
    (top.txReceipt as Record<string, unknown> | undefined) ??
    top;
  const execResult = inner.executionResult;
  const revertedByField = typeof execResult === "string" && execResult.toLowerCase() === "reverted";
  const maybeFn = (inner as { hasExecutionReverted?: () => boolean }).hasExecutionReverted;
  const revertedByMethod = typeof maybeFn === "function" ? Boolean(maybeFn.call(inner)) : false;
  const err = inner.error;
  return {
    reverted: revertedByField || revertedByMethod,
    error: err === undefined || err === null ? null : String(err),
  };
}

// A ContractFunctionInteraction -- loosely typed (tsx strips types; the real
// shape is from @aztec/aztec.js). Just needs `.send({ from })`.
type Interaction = { send: (opts: { from: AztecAddress }) => Promise<unknown> };

/** Send a tx that MUST succeed: throws on a pre-mining throw OR a post-mining
 *  revert (no silent success -- per CLAUDE.md error-handling rules). */
export async function sendOk(
  interaction: Interaction,
  from: AztecAddress,
  label: string,
): Promise<unknown> {
  const receipt = await interaction.send({ from });
  const { reverted, error } = txReverted(receipt);
  if (reverted) throw new Error(`${label} reverted post-mining: ${error ?? "unknown"}`);
  return receipt;
}

/** Send a tx that is EXPECTED to fail. Returns how it failed (threw vs
 *  reverted) so the caller can assert on it. */
export async function sendExpectFail(
  interaction: Interaction,
  from: AztecAddress,
): Promise<{ failed: boolean; how: string }> {
  try {
    const receipt = await interaction.send({ from });
    const { reverted, error } = txReverted(receipt);
    return reverted
      ? { failed: true, how: `reverted post-mining: ${error ?? "unknown"}` }
      : { failed: false, how: "resolved WITHOUT a revert (unexpected)" };
  } catch (e) {
    return { failed: true, how: `threw at send: ${e instanceof Error ? e.message : String(e)}` };
  }
}
