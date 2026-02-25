/**
 * Aztec node client — server-safe, no WASM, no NAPI.
 *
 * Architecture:
 *   Server API routes: connect to the Aztec node via JSON-RPC (plain fetch).
 *     No Aztec SDK bundled server-side — avoids @aztec/bb.js WASM crashes.
 *   Browser: wallet interactions via BrowserEmbeddedWallet (see useAztecWallet.ts).
 *
 * NEVER import @aztec/bb.js, @aztec/pxe, @aztec/wallets/embedded directly here.
 * Those packages crash the Next.js server worker during webpack initialization.
 */

const DEFAULT_NODE_URL =
  process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://aztec:8080";

let lastFailure = 0;
const COOLDOWN_MS = 15_000;

// ── Lightweight JSON-RPC client (zero Aztec SDK dependencies) ────────────────

interface JsonRpcResult<T = unknown> {
  result?: T;
  error?: { code: number; message: string };
}

export async function callNodeRpc<T = unknown>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const url = DEFAULT_NODE_URL;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Aztec node HTTP ${res.status}: ${res.statusText}`);
  }

  const json: JsonRpcResult<T> = await res.json();
  if (json.error) {
    throw new Error(`Aztec node RPC error: ${json.error.message}`);
  }
  return json.result as T;
}

// ── Node health check ─────────────────────────────────────────────────────────

export async function getNodeInfo(): Promise<{
  nodeVersion: string;
  l1ChainId: number;
  rollupVersion: number;
}> {
  return callNodeRpc("node_getNodeInfo");
}

export async function getBlockNumber(): Promise<number> {
  return callNodeRpc("node_getBlockNumber");
}

// ── getNode() / getWallet() — API compatibility shims ────────────────────────
//
// These are kept for backward compatibility with aztecLive.ts.
// They return an object that can call the Aztec node via JSON-RPC.
// Contract .simulate() calls on this "wallet" will fail gracefully
// (no ABI encoding without the SDK), so live mode falls back to simulation.

let cooldown = false;

export async function getNode() {
  if (cooldown) {
    throw new Error("Aztec node in cooldown");
  }

  const now = Date.now();
  if (lastFailure > 0 && now - lastFailure < COOLDOWN_MS) {
    throw new Error("Aztec node connection in cooldown after failure");
  }

  try {
    // Lightweight health check using raw JSON-RPC (no Aztec SDK)
    await callNodeRpc("node_getBlockNumber");
    lastFailure = 0;
    cooldown = false;
    return createNodeShim();
  } catch (err) {
    lastFailure = Date.now();
    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
    throw err;
  }
}

/**
 * Returns a minimal shim that satisfies the wallet type used in aztecLive.ts.
 * Contract .simulate() calls on this shim will fail (no ABI encoding),
 * causing live mode to fall back to simulation.
 */
function createNodeShim() {
  return {
    _isNodeShim: true,
    getNodeInfo,
    getBlockNumber,
    // Wallet-compatible methods that will fail gracefully
    getRegisteredAccounts: async () => [],
    getAccounts: async () => [],
    simulateTx: async () => { throw new Error("SDK not loaded server-side"); },
    sendTx: async () => { throw new Error("SDK not loaded server-side"); },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWallet(): Promise<any> {
  return getNode();
}

export function getPxeUrl(): string {
  return DEFAULT_NODE_URL;
}
