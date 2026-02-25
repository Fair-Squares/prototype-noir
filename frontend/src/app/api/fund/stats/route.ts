import { NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetFundStats } from "@/lib/simulationStore";

export async function GET() {
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetFundStats());
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getLiveFundStats } = await import("@/lib/aztecLive");
    const stats = await getLiveFundStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[fund/stats] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live fund stats" }, { status: 500 });
  }
}
