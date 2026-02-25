import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetKYCStatus } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ verified: simGetKYCStatus(address), source: "simulation" });
  }

  // ── Live mode: read from chain ────────────────────────────────────────────
  try {
    const { getLiveKYCStatus } = await import("@/lib/aztecLive");
    const verified = await getLiveKYCStatus(address);
    return NextResponse.json({ verified, source: "live" });
  } catch (error) {
    console.error("[kyc/status]", error);
    return NextResponse.json({ verified: simGetKYCStatus(address), source: "simulation", fallback: true });
  }
}
