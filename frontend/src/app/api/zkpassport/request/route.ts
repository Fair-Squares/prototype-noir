import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/zkpassport/request
 *
 * Creates a zkPassport verification request.
 * Returns a QR URL for the user to scan with their phone.
 *
 * Body: { userAddress: string }
 * Returns: { qrUrl: string, requestId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    // TODO: integrate real zkPassport SDK
    // const { ZKPassport } = await import("@zkpassport/sdk");
    // const zkp = new ZKPassport(process.env.ZKPASSPORT_DOMAIN!);
    // const qb = await zkp.request({
    //   name: "Fair Squares",
    //   logo: "https://fairsquares.xyz/logo.png",
    //   purpose: "KYC verification for housing fund participation",
    //   scope: "fair-squares-kyc",
    // });
    // const { url, requestId, onResult } = qb.gte("age", 18).done();

    // Stub for prototype
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const qrUrl = `https://zkpassport.id/verify?request=${requestId}`;

    // TODO: store requestId → userAddress mapping in DB for callback

    return NextResponse.json({ qrUrl, requestId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
