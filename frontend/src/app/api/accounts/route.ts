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
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { SIM_ACCOUNTS } from "@/lib/simulationStore";

export interface TestAccount {
  index: number;
  alias: string;
  address: string;
  isAdmin: boolean;
}

// Fallback path: reads account addresses from env vars (written by bootstrap)
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

export async function GET() {
  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json({ accounts: SIM_ACCOUNTS, initialized: true, source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: always derive from serverWallet for address correctness ─
  try {
    const { getTestAccountAddresses } = await import("@/lib/serverWallet");
    const addrs = await getTestAccountAddresses();
    const accounts = addrs.map((a) => ({
      index: a.index,
      alias: a.index === 0 ? "test0 (admin)" : `test${a.index}`,
      address: a.address,
      isAdmin: a.isAdmin,
    }));
    return NextResponse.json({ accounts, initialized: true, source: "live" });
  } catch (e) {
    console.warn("[api/accounts] serverWallet failed, using env fallback:", e);
    const accounts = getAccountsFromEnv();
    return NextResponse.json({ accounts, initialized: false, source: "live" });
  }
}
