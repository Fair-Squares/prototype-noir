import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simAttestFsftForRewards } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { address } = body as { address?: string };

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simAttestFsftForRewards(address);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: "FSFT rewards attestation recorded",
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { error: "FSFT rewards attestation is not deployed yet in live mode" },
    { status: 501 }
  );
}
