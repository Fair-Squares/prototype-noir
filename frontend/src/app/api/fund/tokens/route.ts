import { NextRequest, NextResponse } from "next/server";
import { getTokenInfo, getEurBalance, seedEurBalance } from "@/lib/simulation";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  const tokenInfo = getTokenInfo();

  if (address) {
    seedEurBalance(address, 50_000); // seed demo EUR for new wallets
    const eurBalance = getEurBalance(address);
    return NextResponse.json({
      ...tokenInfo,
      eurBalance,
      source: "simulation",
    });
  }

  return NextResponse.json({ ...tokenInfo, source: "simulation" });
}
