import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetFundStats } from "@/lib/simulationStore";

export async function GET() {
  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetFundStats());
  }

  try {
    const { getLiveFundStats } = await import("@/lib/aztecLive");
    const stats = await getLiveFundStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[fund/stats] live read failed, falling back to simulation:", error);
    return NextResponse.json({ ...simGetFundStats(), fallback: true });
  }
}
