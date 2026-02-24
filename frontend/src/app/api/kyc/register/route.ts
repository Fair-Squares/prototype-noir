import { NextRequest, NextResponse } from "next/server";
import { registerKYC } from "@/lib/simulation";

/**
 * POST /api/kyc/register
 *
 * Registers an address as KYC-verified.
 * In simulation mode: updates in-memory store.
 * In live mode: calls KYCVerifier.register_kyc() on Aztec.
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress, devMode } = await request.json();

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    if (devMode && process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
      return NextResponse.json({ error: "dev mode is not enabled" }, { status: 403 });
    }

    const result = registerKYC(userAddress);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, userAddress });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
