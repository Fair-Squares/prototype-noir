import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import {
  simDemoCloseVoteAndFund,
  simDemoCollectRent,
  simGetDemoSnapshot,
  simResetDemo,
} from "@/lib/simulationStore";

// Guided demo (/demo). SIMULATION ONLY: the shortcuts here stand in for the
// voting window closing, the keeper buying the home and a month of rent —
// things that must never be one click away on a real network. Live mode
// answers 403 and the page points to the regular app flow instead.

const LIVE_REFUSAL =
  "The guided demo runs on the simulated network only. On the live network, use the regular app flow.";

export async function GET() {
  if (isLiveModeEnabled()) {
    return NextResponse.json({ error: LIVE_REFUSAL }, { status: 403 });
  }
  return NextResponse.json({ snapshot: simGetDemoSnapshot(), source: "simulation" });
}

type DemoAction = "reset" | "fund_home" | "collect_rent";

function parseAction(value: unknown): DemoAction {
  if (value === "reset" || value === "fund_home" || value === "collect_rent") return value;
  throw new Error(`Unknown demo action: ${String(value)}`);
}

export async function POST(request: NextRequest) {
  if (isLiveModeEnabled()) {
    return NextResponse.json({ error: LIVE_REFUSAL }, { status: 403 });
  }

  let action: DemoAction;
  try {
    action = parseAction((await request.json()).action);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  if (action === "reset") {
    simResetDemo();
    return NextResponse.json({ success: true, snapshot: simGetDemoSnapshot() });
  }

  const result = action === "fund_home" ? simDemoCloseVoteAndFund() : simDemoCollectRent();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, snapshot: simGetDemoSnapshot() });
}
