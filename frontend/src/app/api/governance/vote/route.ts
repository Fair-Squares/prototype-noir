import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simCastVote } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, proposalId, voteYes } = await request.json().catch(() => ({}));

  if (!address || proposalId === undefined || voteYes === undefined) {
    return NextResponse.json({ error: "address, proposalId and voteYes required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simCastVote(address, Number(proposalId), Boolean(voteYes));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Vote on proposal #${proposalId} recorded (simulation)`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    const wallet = account.wallet;

    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const GovArtifactJson = (await import("@/artifacts/governance-Governance.json")).default;
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    const receipt = await govContract.methods
      .cast_vote(Number(proposalId), Boolean(voteYes))
      .send({ from: AztecAddress.fromString(account.address) });

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
