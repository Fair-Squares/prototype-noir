import { NextResponse } from "next/server";

// FSFTDex V3: there is no separate "match" step. Matching happens ON-CHAIN
// inside the placement transaction — when you place a crossing order via
// POST /api/dex/orders, the contract settles it against the resting book in the
// same tx (no keeper/relayer). This endpoint is retained only to return a clear
// 410 for any legacy caller.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Matching is automatic in FSFTDex V3 — it happens on-chain inside the placement tx. " +
        "Place a crossing order via POST /api/dex/orders; it settles against the resting book. " +
        "There is no separate match endpoint.",
    },
    { status: 410 }
  );
}
