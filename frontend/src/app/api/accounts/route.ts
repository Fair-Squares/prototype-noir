/**
 * GET /api/accounts
 *
 * Returns selectable test accounts for the devnet prototype.
 *
 * Fast path: reads NEXT_PUBLIC_ADMIN_ADDRESS from .env.local (written by bootstrap).
 * Slow path (on first call): server wallet initializes with NodeEmbeddedWallet,
 *   computes test1/test2 addresses from INITIAL_TEST_* key material.
 *
 * The fast path responds instantly so the wallet connect UI never stalls.
 * The slow path enriches the response in the background and is cached for
 * subsequent requests.
 *
 * No browser WASM / EmbeddedWallet needed — the server handles all Aztec crypto.
 */

import { NextResponse } from "next/server";

export interface TestAccount {
  index: number;
  alias: string;
  address: string;
  isAdmin: boolean;
}

// Fast path: returns accounts from env vars (instant, no WASM)
function getAccountsFromEnv(): TestAccount[] {
  const admin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";
  const test1 = process.env.NEXT_PUBLIC_TEST1_ADDRESS ?? "";
  const test2 = process.env.NEXT_PUBLIC_TEST2_ADDRESS ?? "";

  const accounts: TestAccount[] = [];

  if (admin) {
    accounts.push({ index: 0, alias: "test0 (admin)", address: admin, isAdmin: true });
  }
  if (test1) {
    accounts.push({ index: 1, alias: "test1", address: test1, isAdmin: false });
  }
  if (test2) {
    accounts.push({ index: 2, alias: "test2", address: test2, isAdmin: false });
  }

  // Always provide at least test0
  if (accounts.length === 0) {
    accounts.push({
      index: 0,
      alias: "test0 (admin)",
      address: "0x0000000000000000000000000000000000000000000000000000000000000000",
      isAdmin: true,
    });
  }

  return accounts;
}

// Cached computed accounts from the server wallet (populated after first init)
let computedAccounts: TestAccount[] | null = null;

// Background init — computes test1/test2 addresses from WASM key derivation
// Does NOT block the response; populates computedAccounts for future calls.
async function warmServerWallet() {
  if (computedAccounts !== null) return;
  try {
    const { getTestAccountAddresses } = await import("@/lib/serverWallet");
    const addrs = await getTestAccountAddresses();
    computedAccounts = addrs.map((a) => ({
      index: a.index,
      alias: a.index === 0 ? "test0 (admin)" : `test${a.index}`,
      address: a.address,
      isAdmin: a.isAdmin,
    }));
    console.log("[api/accounts] Server wallet ready, account addresses cached.");
  } catch (e) {
    console.warn("[api/accounts] Server wallet init failed (non-fatal):", e);
  }
}

export async function GET() {
  // Kick off background wallet init (no-op if already done)
  warmServerWallet().catch(() => {});

  // Return immediately using env-derived accounts (fast path)
  // Once computedAccounts is populated, subsequent calls return the richer data
  const accounts = computedAccounts ?? getAccountsFromEnv();
  return NextResponse.json({ accounts, initialized: computedAccounts !== null });
}
