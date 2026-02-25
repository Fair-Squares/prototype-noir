import { NextRequest, NextResponse } from "next/server";
import { getLiveProposals } from "@/lib/aztecLive";

export async function GET() {
  try {
    const proposals = await getLiveProposals();
    return NextResponse.json({ proposals, source: "live" });
  } catch (error) {
    console.error("[governance/proposals]", error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { title, description, amount, from } = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      error: "Proposal creation requires a signed transaction",
      action: "Use the CLI or connect a browser wallet",
      cli: `aztec-wallet send --from accounts:${from ?? "test0"} --contract-address $GOVERNANCE --artifact governance -- create_proposal "${title ?? "New Proposal"}" ${amount ?? 0} $(date -d '+14 days' +%s)`,
    },
    { status: 501 }
  );
}
