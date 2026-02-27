import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simCancelDexOrder } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { address, orderId } = body as { address?: string; orderId?: number };

  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simCancelDexOrder(address, Number(orderId));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: "Order cancelled", source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { error: "DEX live contract is not deployed yet. Use simulation mode." },
    { status: 501 }
  );
}
