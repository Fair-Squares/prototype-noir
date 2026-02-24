import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/simulation";

export async function POST(request: NextRequest) {
  try {
    const { address, proposalId, voteYes } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    if (proposalId === undefined) {
      return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
    }
    if (voteYes === undefined) {
      return NextResponse.json({ error: "voteYes is required" }, { status: 400 });
    }

    const result = castVote(address, proposalId, voteYes);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Vote ${voteYes ? "YES" : "NO"} cast privately on proposal #${proposalId}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
