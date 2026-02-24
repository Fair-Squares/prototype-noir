import { NextResponse } from "next/server";
import { getAccounts } from "@/lib/simulation";
import { getLiveAccounts, isLiveModeEnabled } from "@/lib/aztecLive";

export async function GET() {
  if (isLiveModeEnabled()) {
    try {
      const accounts = await getLiveAccounts();
      return NextResponse.json({ accounts, source: "aztec" });
    } catch (error) {
      console.error("[wallet/accounts] live mode failed, falling back to simulation", error);
    }
  }

  const accounts = getAccounts();
  return NextResponse.json({ accounts, source: "simulation" });
}
