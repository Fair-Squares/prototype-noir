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

import { resolveServerPxeUrl } from "@/lib/pxeUrl";

const DEFAULT_NODE_URL =
  resolveServerPxeUrl();

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

export async function getBlockNumber(): Promise<number> {
  return callNodeRpc("node_getBlockNumber");
}
