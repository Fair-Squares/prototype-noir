/**
 * POST /api/accounts/create
 *
 * Creates a new selectable account.
 *
 * Live mode: deploys a REAL Schnorr account server-side (fees sponsored by the
 *   canonical SponsoredFPC) and registers it in the shared PXE, so it can verify
 *   KYC, deposit, vote, and trade like the deterministic test accounts. Returns
 *   { index, address, alias }. The account lives in the server wallet's in-memory
 *   list (also surfaced by GET /api/accounts) for the lifetime of the server
 *   process — it is NOT persisted across a server restart (acceptable for the
 *   local demo; see the M16 note in serverWallet.ts).
 *
 * Simulation mode: returns a fresh phantom address (no chain). The in-memory
 *   sim store lazily creates per-address state, so this is enough for sim demos;
 *   the client assigns the index.
 */

import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";

export async function POST() {
  // ── Simulation mode: a client-usable phantom address is sufficient ──────────
  if (!isLiveModeEnabled()) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const address =
      "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return NextResponse.json({ address, source: "simulation" });
  }

  // ── Live mode: deploy a real, fee-sponsored account ─────────────────────────
  try {
    const { createGeneratedAccount } = await import("@/lib/serverWallet");
    const account = await createGeneratedAccount();
    return NextResponse.json({ ...account, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[api/accounts/create]", msg);
    return NextResponse.json(
      { error: `Could not create account: ${msg}` },
      { status: 500 }
    );
  }
}
