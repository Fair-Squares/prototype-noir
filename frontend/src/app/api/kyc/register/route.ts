import { NextRequest, NextResponse } from "next/server";
import { registerKYC } from "@/lib/simulation";
import { isLiveModeEnabled, registerLiveKyc } from "@/lib/aztecLive";

export async function POST(request: NextRequest) {
  try {
    const { userAddress, devMode } = await request.json();

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    if (devMode && process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
      return NextResponse.json({ error: "dev mode is not enabled" }, { status: 403 });
    }

    if (isLiveModeEnabled()) {
      try {
        await registerLiveKyc(userAddress);
        return NextResponse.json({ success: true, userAddress, source: "aztec" });
      } catch (error) {
        console.error("[kyc/register] live mode failed, falling back to simulation", error);
      }
    }

    const result = registerKYC(userAddress);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, userAddress, source: "simulation" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
