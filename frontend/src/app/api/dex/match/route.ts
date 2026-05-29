import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simMatchDexOrder } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, orderId } = body as {
    address?: string;
    orderId?: number;
    makerOrderId?: number;
    accountIndex?: number;
  };

  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simMatchDexOrder(address, Number(orderId));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: "Order matched", source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // Phase 1: EUR migrated to the AIP-20 standard token, but the DEX contract
  // still settles EUR via the legacy fund_token interface, so live on-chain
  // matching would revert. Order placement / viewing / cancellation remain
  // fully functional. The full DEX settlement migration to AIP-20
  // (transfer_private_to_private + authwit on both legs) lands in Phase 3,
  // which will re-implement this handler.
  return NextResponse.json(
    {
      error:
        "DEX settlement is being upgraded to the AIP-20 token standard (Phase 3). " +
        "You can still place, view, and cancel orders; matching is temporarily disabled.",
      code: "DEX_MATCH_UPGRADING",
    },
    { status: 503 }
  );
}
