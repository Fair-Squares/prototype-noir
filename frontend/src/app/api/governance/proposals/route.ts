import { NextRequest, NextResponse } from "next/server";
import { getProposals, createProposal } from "@/lib/simulation";
import { isLiveModeEnabled, getLiveProposals } from "@/lib/aztecLive";

export async function GET() {
  if (isLiveModeEnabled()) {
    try {
      const proposals = await getLiveProposals();
      return NextResponse.json({ proposals, source: "aztec" });
    } catch (error) {
      console.error("[governance/proposals] live mode failed, falling back to simulation", error);
    }
  }

  const proposals = getProposals();
  return NextResponse.json({ proposals, source: "simulation" });
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, amount, deadlineDays } = await request.json();

    if (!title || !description || !amount) {
      return NextResponse.json({ error: "title, description, and amount are required" }, { status: 400 });
    }

    const result = createProposal(title, description, parseFloat(amount), deadlineDays ?? 14);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, proposal: result.proposal });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
