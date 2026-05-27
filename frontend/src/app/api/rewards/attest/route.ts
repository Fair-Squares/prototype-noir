import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simAttestFsftForRewards } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, accountIndex = 0 } = body as {
    address?: string;
    accountIndex?: number;
  };

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simAttestFsftForRewards(address);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: "FSFT rewards attestation recorded",
      fsftProofMode: "aztec-private-proven",
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const rewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!rewardsAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const actorAddress = AztecAddress.fromString(actor.address);
    let holderProofGenerated = false;
    let holderProofMode: "none" | "aztec-private-proven" = "none";

    if (fundTokenAddr) {
      try {
        const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
        const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
        const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, actor.wallet);
        await ftContract.methods.attest_private_holder().send({ from: actorAddress });
        holderProofMode = "aztec-private-proven";
        holderProofGenerated = true;
      } catch {
        // Public FSFT holders can still attest rewards eligibility without this private-holder proof.
      }
    }

    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, actor.wallet);

    const receipt = await rewardsContract.methods.attest_private_fsft_for_rewards().send({ from: actorAddress });
    return NextResponse.json({
      success: true,
      message: holderProofGenerated
        ? "Private FSFT proof generated and rewards eligibility recorded"
        : "FSFT rewards eligibility recorded",
      txHash: requireAztecTxHash(receipt),
      holderProofGenerated,
      fsftProofMode: holderProofMode,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/attest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
