import { NextRequest, NextResponse } from "next/server";
import { deposit } from "@/lib/simulation";
import { isLiveModeEnabled, liveDeposit } from "@/lib/aztecLive";

export async function POST(request: NextRequest) {
  try {
    const { address, amount } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    }

    if (isLiveModeEnabled()) {
      try {
        await liveDeposit(address, parseFloat(amount));
        return NextResponse.json({
          success: true,
          message: `Deposited €${amount} on-chain`,
          source: "aztec",
        });
      } catch (error) {
        console.error("[fund/deposit] live mode failed, falling back to simulation", error);
      }
    }

    const result = deposit(address, parseFloat(amount));
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Deposited €${amount} privately`,
      source: "simulation",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
