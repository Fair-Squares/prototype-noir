import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/zkpassport/request
 *
 * Dev mode (NEXT_PUBLIC_DEV_MODE=true): Returns a dev:// bypass URL.
 *   The frontend detects this and auto-approves after a short delay.
 *
 * Production: Creates a real zkPassport QR verification request.
 *   User scans with their phone, proves age >= 18 without revealing DOB.
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === "true";

    // ── Dev mode: instant bypass ─────────────────────────────────────────
    if (isDev) {
      const requestId = `dev_${userAddress.slice(2, 10)}_${Date.now()}`;
      return NextResponse.json({
        qrUrl: `dev://bypass?id=${requestId}&address=${userAddress}`,
        requestId,
        devMode: true,
        message: "Dev mode: verification will auto-complete",
      });
    }

    // ── Production: real zkPassport flow ─────────────────────────────────
    // The @zkpassport/sdk is installed but only used in production.
    // Import dynamically to avoid issues in simulation/dev environments.
    try {
      const { ZKPassport } = await import("@zkpassport/sdk");
      const domain = process.env.ZKPASSPORT_DOMAIN ?? "fair-squares.vercel.app";
      const zkp = new ZKPassport(domain);

      const queryBuilder = await zkp.request({
        name: "Fair Squares",
        logo: `https://${domain}/brand/fs-light.png`,
        purpose: "Verify you are 18+ to participate in the housing fund",
        scope: "fair-squares-kyc",
      });

      const { url, requestId } = queryBuilder.gte("age", 18).done();

      // TODO: store requestId → userAddress in a database for the callback
      // For now, encode userAddress in requestId
      const compositeId = `${requestId}::${userAddress}`;

      return NextResponse.json({ qrUrl: url, requestId: compositeId, devMode: false });
    } catch (sdkErr) {
      console.warn("[zkpassport] SDK not available, falling back to dev mode:", sdkErr);
      const requestId = `dev_${userAddress.slice(2, 10)}_${Date.now()}`;
      return NextResponse.json({
        qrUrl: `dev://bypass?id=${requestId}&address=${userAddress}`,
        requestId,
        devMode: true,
        message: "zkPassport SDK unavailable — using dev bypass",
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
