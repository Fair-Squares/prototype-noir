/**
 * Aztec PXE client and wallet singleton.
 *
 * Provides a shared connection to the Aztec node for all API routes
 * when running in live mode (AZTEC_LIVE=true).
 */

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

const DEFAULT_PXE_URL = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://aztec:8080";

let walletPromise: Promise<EmbeddedWallet> | null = null;
let lastFailure = 0;
const COOLDOWN_MS = 15_000;

/**
 * Get (or create) an EmbeddedWallet connected to the Aztec PXE.
 * This is a server-side singleton -- shared across API route calls.
 */
export async function getWallet(): Promise<EmbeddedWallet> {
  const now = Date.now();
  if (lastFailure > 0 && now - lastFailure < COOLDOWN_MS) {
    throw new Error("Aztec wallet connection in cooldown after failure");
  }

  if (!walletPromise) {
    walletPromise = (async () => {
      const pxeUrl = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
      console.log(`[aztecClient] Connecting to PXE at ${pxeUrl}...`);
      const node = createAztecNodeClient(pxeUrl);
      const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
      console.log("[aztecClient] Wallet connected");
      return wallet;
    })();
  }

  try {
    return await walletPromise;
  } catch (err) {
    lastFailure = Date.now();
    walletPromise = null;
    throw err;
  }
}

/**
 * Get the PXE URL for direct HTTP calls (e.g., /status healthcheck).
 */
export function getPxeUrl(): string {
  return process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
}
