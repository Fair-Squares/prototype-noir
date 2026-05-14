import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simClaimDistribution } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

export async function POST(request: NextRequest) {
  const { proposalId, accountIndex = 0, address } = await request.json();

  if (proposalId === undefined) {
    return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simClaimDistribution(Number(proposalId), address ?? "0x0");
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimedAmount: result.claimedAmount ?? 0,
      txHash: `sim_claim_${Date.now()}`,
      message: "Distribution claimed (simulation)",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const actor = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, actor.wallet);
    const actorAddress = AztecAddress.fromString(actor.address);

    const claimableAmount = Number(
      await hfContract.methods
        .get_claimable_amount(Number(proposalId), actorAddress)
        .simulate({ from: actorAddress })
    );
    if (claimableAmount <= 0) {
      return NextResponse.json({ error: "No claimable distribution amount for this account" }, { status: 400 });
    }

    const receipt = await hfContract.methods
      .claim_distribution(Number(proposalId))
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      claimedAmount: claimableAmount,
      txHash: requireAztecTxHash(receipt),
      message: "Distribution claimed",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/claim]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
