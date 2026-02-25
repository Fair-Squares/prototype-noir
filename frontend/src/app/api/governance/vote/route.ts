import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simCastVote } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, proposalId, voteYes } = await request.json().catch(() => ({}));

  if (!address || proposalId === undefined || voteYes === undefined) {
    return NextResponse.json({ error: "address, proposalId and voteYes required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const result = simCastVote(address, Number(proposalId), Boolean(voteYes));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Vote on proposal #${proposalId} recorded (simulation)`,
    });
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const wallet = await getTestAccountWallet(accountIndex);

    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const { Contract, loadContractArtifact } = await import("@aztec/aztec.js");
    const { AztecAddress } = await import("@aztec/stdlib");
    const GovArtifactJson = (await import("@/artifacts/governance-Governance.json")).default;
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    const receipt = await govContract.methods
      .cast_vote(Number(proposalId), Boolean(voteYes))
      .send()
      .wait();

    return NextResponse.json({
      success: true,
      message: `Vote on proposal #${proposalId} recorded`,
      txHash: receipt.txHash?.toString() ?? "unknown",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/vote]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
