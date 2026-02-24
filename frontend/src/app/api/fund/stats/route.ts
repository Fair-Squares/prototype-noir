import { NextResponse } from "next/server";
import { getFundStats } from "@/lib/simulation";
import { getLiveFundStats, isLiveModeEnabled } from "@/lib/aztecLive";

export async function GET() {
  if (isLiveModeEnabled()) {
    try {
      const stats = await getLiveFundStats();
      return NextResponse.json({ ...stats, source: "aztec" });
    } catch (error) {
      console.error("[fund/stats] live mode failed, falling back to simulation", error);
    }
  }

  const stats = getFundStats();
  return NextResponse.json({ ...stats, source: "simulation" });
}
