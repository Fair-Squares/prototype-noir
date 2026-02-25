import { NextRequest, NextResponse } from "next/server";
import { deposit, seedEurBalance } from "@/lib/simulation";

export async function POST(request: NextRequest) {
  try {
    const { address, amount } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    }

    // Ensure demo EUR balance exists for this wallet
    seedEurBalance(address, 50_000);

    const result = deposit(address, Number(amount));
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message ?? `Deposited €${amount}`,
      source: "simulation",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
