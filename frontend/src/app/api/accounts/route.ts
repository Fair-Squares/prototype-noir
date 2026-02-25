/**
 * GET /api/accounts
 *
 * Returns the 3 selectable test accounts for the devnet prototype.
 *
 * Simulation mode: returns static SIM_ACCOUNTS (instant, no Aztec needed).
 * Live mode: reads from env vars (written by bootstrap) then enriches
 *   with server wallet for computed test1/test2 addresses.
 */

import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { SIM_ACCOUNTS } from "@/lib/simulationStore";

export interface TestAccount {
  index: number;
  alias: string;
  address: string;
  isAdmin: boolean;
}

// Fast path: reads account addresses from env vars (written by bootstrap)
function getAccountsFromEnv(): TestAccount[] {
  const addrs = [
    process.env.NEXT_PUBLIC_TEST0_ADDRESS ?? process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "",
    process.env.NEXT_PUBLIC_TEST1_ADDRESS ?? "",
    process.env.NEXT_PUBLIC_TEST2_ADDRESS ?? "",
  ];

  const aliases = ["test0 (admin)", "test1", "test2"];
  const accounts: TestAccount[] = [];

  for (let i = 0; i < 3; i++) {
    if (addrs[i]) {
      accounts.push({ index: i, alias: aliases[i], address: addrs[i], isAdmin: i === 0 });
    }
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

// Cached computed accounts from the server wallet
let computedAccounts: TestAccount[] | null = null;

// Background init — computes all test addresses from key derivation
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
  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ accounts: SIM_ACCOUNTS, initialized: true, source: "simulation" });
  }

  // ── Live mode: env-based fast path + background wallet init ───────────
  warmServerWallet().catch(() => {});

  const accounts = computedAccounts ?? getAccountsFromEnv();
  return NextResponse.json({ accounts, initialized: computedAccounts !== null, source: "live" });
}
