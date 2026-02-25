import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/simulation";
import { isLiveModeEnabled, liveCastVote } from "@/lib/aztecLive";

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

    if (isLiveModeEnabled()) {
      try {
        await liveCastVote(address, proposalId, voteYes);
        return NextResponse.json({
          success: true,
          message: `Vote ${voteYes ? "YES" : "NO"} cast on-chain on proposal #${proposalId}`,
          source: "aztec",
        });
      } catch (error) {
        console.error("[governance/vote] live mode failed, falling back to simulation", error);
      }
    }

    const result = castVote(address, proposalId, voteYes);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Vote ${voteYes ? "YES" : "NO"} cast privately on proposal #${proposalId}`,
      source: "simulation",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
