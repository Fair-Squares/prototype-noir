import { NextRequest, NextResponse } from "next/server";
import { isKYCVerified } from "@/lib/simulation";
import { getLiveKycStatus, isLiveModeEnabled } from "@/lib/aztecLive";

/**
 * GET /api/kyc/status?address=xxx
 *
 * Checks if an address is KYC-verified.
 * In simulation mode: checks in-memory store.
 * In live mode: calls KYCVerifier.is_verified() on Aztec.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  if (isLiveModeEnabled()) {
    try {
      const verified = await getLiveKycStatus(address);
      return NextResponse.json({ verified, address, source: "aztec" });
    } catch (error) {
      console.error("[kyc/status] live mode failed, falling back to simulation", error);
    }
  }

  const verified = isKYCVerified(address);
  return NextResponse.json({ verified, address, source: "simulation" });
}
