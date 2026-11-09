import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { getBlockNumber } from "@/lib/aztecClient";

// Live block height changes per tx, so never cache it.
export const dynamic = "force-dynamic";

/**
 * Lightweight current-block endpoint for the footer ticker. Uses the plain
 * node_getBlockNumber JSON-RPC (aztecClient) — NOT the embedded-wallet PXE — so
 * polling it never queues PXE jobs. Reports `mode` so the UI can show
 * "Simulation" instead of a fabricated height when there is no live chain, and
 * returns `blockNumber: null` (never a fake 0) when the height is unknown.
 */
export async function GET() {
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ mode: "simulation", blockNumber: null });
  }
  try {
    const blockNumber = await getBlockNumber();
    return NextResponse.json({ mode: "live", blockNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Surface the failure (503 + message) rather than masking it with a value.
    return NextResponse.json({ mode: "live", blockNumber: null, error: message }, { status: 503 });
  }
}
