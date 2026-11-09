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
  const isSimulation =
    process.env.NEXT_PUBLIC_SIMULATION === "true" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  // ── Dev mode: instant verification ───────────────────────────────────────
  if (isSimulation || requestId.startsWith("dev_")) {
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

    const sdkModule = (await import("@zkpassport/sdk")) as {
      ZKPassport: new (domain: string) => unknown;
    };
    const { ZKPassport } = sdkModule;
    const domain = process.env.ZKPASSPORT_DOMAIN ?? "proto.fair-squares.nl";
    const zkp = new ZKPassport(domain) as {
      getResult?: (id: string) => Promise<unknown>;
      getRequestStatus?: (id: string) => Promise<unknown>;
    };

    // v0.12+ uses bridge callbacks; polling helpers may be absent.
    // Use feature detection so builds don't fail across SDK versions.
    let result: unknown = null;
    if (typeof zkp.getResult === "function") {
      result = await zkp.getResult(zkId);
    } else if (typeof zkp.getRequestStatus === "function") {
      result = await zkp.getRequestStatus(zkId);
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
