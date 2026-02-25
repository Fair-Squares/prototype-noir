/**
 * Aztec client — server-side node connection and client-side wallet helper.
 *
 * Architecture:
 *   Server-side (Next.js API routes): connects to the Aztec node for reading
 *   public contract state via simulateTx. No signing keys needed.
 *
 *   Client-side (browser): wallet connection is handled by the browser wallet
 *   adapter (see future wallet-connect integration).
 *
 * NOTE: @aztec/wallets/embedded is NOT imported here. It uses NAPI binaries
 * and worker threads that are incompatible with the Next.js server runtime.
 * All live contract reads go through the node client below.
 */

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import type { AztecNode } from "@aztec/aztec.js/node";

const DEFAULT_PXE_URL =
  process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://aztec:8080";

let nodePromise: Promise<AztecNode> | null = null;
let lastFailure = 0;
const COOLDOWN_MS = 15_000;

/**
 * Get (or reuse) an AztecNode client for server-side contract reads.
 */
export async function getNode(): Promise<AztecNode> {
  const now = Date.now();
  if (lastFailure > 0 && now - lastFailure < COOLDOWN_MS) {
    throw new Error("Aztec node connection in cooldown after failure");
  }

  if (!nodePromise) {
    nodePromise = (async () => {
      const url = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
      console.log(`[aztecClient] Connecting to node at ${url}...`);
      const node = createAztecNodeClient(url);
      // Quick health check
      await node.getNodeInfo();
      console.log("[aztecClient] Node connected");
      return node;
    })();
  }

  try {
    return await nodePromise;
  } catch (err) {
    lastFailure = Date.now();
    nodePromise = null;
    throw err;
  }
}

/**
 * getWallet() — kept for API compatibility with aztecLive.ts.
 *
 * Returns the node client cast as a wallet-compatible type so existing
 * contract read (simulate) calls work. Write operations (send) will fail
 * gracefully and the caller should handle that.
 *
 * Full client-side wallet support to be added via browser wallet adapter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWallet(): Promise<any> {
  return getNode();
}

/**
 * Get the PXE URL for direct HTTP calls (e.g., /status healthcheck).
 */
export function getPxeUrl(): string {
  return process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
}
