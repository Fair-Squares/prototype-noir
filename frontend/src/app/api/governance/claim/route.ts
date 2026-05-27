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

    // V2 path: claim_distribution_private needs a hinted DepositNote the
    // caller already owns plus the public distribution params (amount +
    // snapshot total) which the public tail re-verifies against storage.
    const depositsResult = (await hfContract.methods
      .get_my_deposit_notes(actorAddress, 0)
      .simulate({ from: actorAddress })) as {
      len: bigint;
      storage: unknown[];
    };
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit note for this account; deposit before claiming." },
        { status: 403 }
      );
    }
    const hintedDepositNote = depositsResult.storage[0];

    const status = (await hfContract.methods
      .get_distribution_status(Number(proposalId))
      .simulate({ from: actorAddress })) as {
      open: boolean;
      amount: bigint;
      total_deposits_snapshot: bigint;
      claimed_total: bigint;
    };
    if (!status.open) {
      return NextResponse.json({ error: "Distribution not open for this proposal" }, { status: 400 });
    }
    if (status.total_deposits_snapshot === 0n) {
      return NextResponse.json({ error: "Distribution snapshot is zero" }, { status: 400 });
    }
    const distributionAmount = BigInt(status.amount);
    const snapshotTotal = BigInt(status.total_deposits_snapshot);

    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!fundTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FUND_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    const receipt = await hfContract.methods
      .claim_distribution_private(
        Number(proposalId),
        hintedDepositNote,
        AztecAddress.fromString(fundTokenAddr),
        distributionAmount,
        snapshotTotal,
      )
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      claimedAmount: Number(distributionAmount),
      txHash: requireAztecTxHash(receipt),
      message: "Distribution claimed privately",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/claim]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
