import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simClaimRewards } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, accountIndex = 0 } = body as { address?: string; accountIndex?: number };

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simClaimRewards(address);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimed: result.claimed ?? 0,
      message: "Protocol rewards claimed",
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

    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, actor.wallet);

    const claimableBefore = Number(
      await rewardsContract.methods.get_claimable(userAddress).simulate({ from: actorAddress })
    );
    if (claimableBefore < 1) {
      return NextResponse.json({ error: "Claimable amount is below minimum (1 token)" }, { status: 400 });
    }

    const receipt = await rewardsContract.methods.claim().send({ from: actorAddress });
    return NextResponse.json({
      success: true,
      claimed: claimableBefore,
      message: "Protocol rewards claimed",
      txHash: requireAztecTxHash(receipt),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/claim]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
