import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetDexOrderbook, simPlaceDexOrder } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? undefined;

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetDexOrderbook(address));
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { address, side, amount, limitPriceEur } = body as {
    address?: string;
    side?: "buy" | "sell";
    amount?: number;
    limitPriceEur?: number;
  };

  if (!address || !side || !amount) {
    return NextResponse.json({ error: "address, side and amount are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simPlaceDexOrder(address, side, Number(amount), limitPriceEur ? Number(limitPriceEur) : undefined);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      order: result.order,
      message: "Order placed",
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
    { error: "DEX live contract is not deployed yet. Use simulation mode." },
    { status: 501 }
  );
}
