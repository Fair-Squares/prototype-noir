import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/zkpassport/status?requestId=xxx
 *
 * Polls the verification status of a zkPassport request.
 * Returns: { status: "pending" | "verified" | "failed" }
 */
export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("requestId");

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  // TODO: look up real status from zkPassport SDK callback / DB
  // For prototype: always return "pending" (use dev mode to skip)
  return NextResponse.json({ status: "pending", requestId });
}
