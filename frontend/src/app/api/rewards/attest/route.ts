import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simAttestFsftForRewards } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

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
      eligible: true,
      message: "FSFT rewards eligibility recorded",
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
    const userAddress = AztecAddress.fromString(address);

    // AIP-20 migration: the explicit attest flow (FSFT.attest_private_holder +
    // ProtocolRewards.attest_private_fsft_for_rewards) is removed. Rewards
    // eligibility is now derived directly from the public FSFT balance, exposed
    // by ProtocolRewards.has_fsft_rewards_eligibility (balance_of_public > 0).
    // No transaction is sent; this endpoint just reports current eligibility.
    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, actor.wallet);

    const eligible = Boolean(
      simResult(
        await rewardsContract.methods.has_fsft_rewards_eligibility(userAddress).simulate({ from: actorAddress })
      )
    );

    return NextResponse.json({
      success: true,
      eligible,
      message: eligible
        ? "FSFT rewards eligibility confirmed (public balance > 0)"
        : "No FSFT exposure: hold FSFT to become eligible for rewards.",
      fsftProofMode: eligible ? "aztec-public-balance" : "none",
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/attest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
