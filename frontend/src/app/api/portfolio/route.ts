import { NextRequest, NextResponse } from "next/server";
import { getBalance, getFundStats } from "@/lib/simulation";
import { getLivePortfolio, isLiveModeEnabled } from "@/lib/aztecLive";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  if (isLiveModeEnabled()) {
    try {
      const portfolio = await getLivePortfolio(address);
      return NextResponse.json({ ...portfolio, source: "aztec" });
    } catch (error) {
      console.error("[portfolio] live mode failed, falling back to simulation", error);
    }
  }

  const balance = getBalance(address);
  const stats = getFundStats();
  const totalSupply = stats.totalSupply;
  const sharePercent = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;
  const estimatedYield = balance * 0.03; // 3% APY

  return NextResponse.json({
    balance,
    totalSupply,
    sharePercent: Math.round(sharePercent * 100) / 100,
    estimatedYield: Math.round(estimatedYield * 100) / 100,
    source: "simulation",
  });
}
