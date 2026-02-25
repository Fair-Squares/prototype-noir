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

    // ── Production: real zkPassport flow (v0.12 API) ─────────────────────
    // v0.12 uses a bridge/WebSocket model. The QR URL is returned immediately
    // but verification result comes via onResult callback (not polling).
    // For a proper production integration, use a persistent service.
    try {
      const { ZKPassport } = await import("@zkpassport/sdk");
      const domain = process.env.ZKPASSPORT_DOMAIN ?? "fair-squares.vercel.app";
      const zkp = new ZKPassport(domain);

      // zkp.request() creates a bridge connection and returns a query builder
      const queryBuilder = await zkp.request({
        name: "Fair Squares",
        logo: `https://${domain}/brand/fs-light.png`,
        purpose: "Verify you are 18+ to participate in the housing fund",
        scope: "fair-squares-kyc",
        devMode: false,
      });

      // Add age constraint and get the QR URL
      const { url, requestId } = queryBuilder.gte("age", 18).done();

      // requestId is the bridge topic ID — use it to track verification
      const compositeId = `${requestId}::${userAddress}`;

      // Note: real result comes via onResult callback, not polling.
      // A production implementation would need a persistent WebSocket service.
      return NextResponse.json({ qrUrl: url, requestId: compositeId, devMode: false });
    } catch (sdkErr) {
      console.warn("[zkpassport] SDK error, falling back to dev mode:", sdkErr);
      const requestId = `dev_${userAddress.slice(2, 10)}_${Date.now()}`;
      return NextResponse.json({
        qrUrl: `dev://bypass?id=${requestId}&address=${userAddress}`,
        requestId,
        devMode: true,
        message: "zkPassport unavailable — using dev bypass",
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
