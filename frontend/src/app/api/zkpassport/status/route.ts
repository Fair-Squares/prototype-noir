import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/zkpassport/status?requestId=...
 *
 * Dev mode: requestIds starting with "dev_" are instantly verified.
 * Production: poll zkPassport for proof result.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("requestId") ?? "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  // ── Dev mode: instant verification ───────────────────────────────────────
  if (requestId.startsWith("dev_")) {
    return NextResponse.json({
      verified: true,
      devMode: true,
      message: "Dev bypass — age verification skipped",
      proofType: "dev",
    });
  }

  // ── Production: check zkPassport proof status ─────────────────────────────
  try {
    // requestId format: "zkpassport_id::userAddress"
    const [zkId] = requestId.split("::");

    const { ZKPassport } = await import("@zkpassport/sdk");
    const domain = process.env.ZKPASSPORT_DOMAIN ?? "fair-squares.vercel.app";
    const zkp = new ZKPassport(domain);

    // Poll for result
    const result = await zkp.getResult(zkId);
    if (!result) {
      return NextResponse.json({ verified: false, pending: true });
    }

    const verified = result.ageCheck?.passed === true;
    return NextResponse.json({ verified, devMode: false, result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[zkpassport/status]", msg);
    // If SDK fails, treat as pending
    return NextResponse.json({ verified: false, pending: true, error: msg });
  }
}
