import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetPortfolio(address));
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { getLivePortfolio } = await import("@/lib/aztecLive");
    const portfolio = await getLivePortfolio(address);
    return NextResponse.json(portfolio);
  } catch (error) {
    console.error("[portfolio] live read failed, falling back to simulation:", error);
    return NextResponse.json({ ...simGetPortfolio(address), fallback: true });
  }
}
