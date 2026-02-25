import { NextRequest, NextResponse } from "next/server";
import { getLivePortfolio } from "@/lib/aztecLive";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  try {
    const portfolio = await getLivePortfolio(address);
    return NextResponse.json(portfolio);
  } catch (error) {
    console.error("[portfolio]", error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
