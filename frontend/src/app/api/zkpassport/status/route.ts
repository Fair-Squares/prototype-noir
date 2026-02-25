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

    // v0.12+ uses bridge callbacks; polling helpers may be absent.
    // Use feature detection so builds don't fail across SDK versions.
    const zkpAny = zkp as unknown as {
      getResult?: (id: string) => Promise<unknown>;
      getRequestStatus?: (id: string) => Promise<unknown>;
    };

    let result: unknown = null;
    if (typeof zkpAny.getResult === "function") {
      result = await zkpAny.getResult(zkId);
    } else if (typeof zkpAny.getRequestStatus === "function") {
      result = await zkpAny.getRequestStatus(zkId);
    } else {
      // No polling API exposed by current SDK build.
      return NextResponse.json({ verified: false, pending: true });
    }

    if (!result) {
      return NextResponse.json({ verified: false, pending: true });
    }

    const verified = (result as { ageCheck?: { passed?: boolean } }).ageCheck?.passed === true;
    return NextResponse.json({ verified, devMode: false, result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[zkpassport/status]", msg);
    // If SDK fails, treat as pending
    return NextResponse.json({ verified: false, pending: true, error: msg });
  }
}
