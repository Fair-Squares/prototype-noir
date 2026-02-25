import { NextRequest, NextResponse } from "next/server";
import { getPortfolio, seedEurBalance } from "@/lib/simulation";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  // Seed demo EUR for any new address so they can try the invest flow
  seedEurBalance(address, 50_000);

  const portfolio = getPortfolio(address);

  return NextResponse.json({
    ...portfolio,
    sharePercent: Math.round(portfolio.sharePercent * 100) / 100,
    estimatedYield: Math.round(portfolio.estimatedYield * 100) / 100,
    source: "simulation",
  });
}
