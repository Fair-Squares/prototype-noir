import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simCastVote } from "@/lib/simulationStore";

function isNonZeroField(value: unknown): boolean {
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0";
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString() !== "0";
  }
  return false;
}

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, proposalId, voteYes } = await request.json();

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
    if (address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    if (!kycAddr) return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });
    if (!housingFundAddr) return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    if (!fundTokenAddr) return NextResponse.json({ error: "NEXT_PUBLIC_FUND_TOKEN_ADDRESS not set" }, { status: 500 });

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const accountAddress = AztecAddress.fromString(account.address);
    const userAddress = AztecAddress.fromString(address);

    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const FtArtifactJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);
    const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
    const isInvestor = await kycContract.methods
      .is_investor(userAddress)
      .simulate({ from: accountAddress });
    if (!Boolean(isInvestor)) {
      return NextResponse.json(
        {
          error: "Investor role required to vote",
          eligibility: {
            investorRole: false,
            hasDepositTicket: false,
            hasFsftExposure: false,
            hasPrivateHolderProof: false,
            privateFsftProofMode: "none",
            recursiveVkConfigured: false,
            reason: "Complete KYC investor verification first.",
          },
        },
        { status: 403 }
      );
    }

    const [depositTicket, fsftBalance, hasPrivateHolderProof, privateHolderVkHash] = await Promise.all([
      hfContract.methods.get_user_deposit_ticket(userAddress).simulate({ from: accountAddress }),
      ftContract.methods.public_balance_of(userAddress).simulate({ from: accountAddress }),
      ftContract.methods.has_private_holder_proof(userAddress).simulate({ from: accountAddress }),
      ftContract.methods
        .get_private_holder_vk_hash()
        .simulate({ from: accountAddress }),
    ]);
    const hasDepositTicket = Number(depositTicket) > 0;
    const hasFsftExposure = Number(fsftBalance) > 0 || Boolean(hasPrivateHolderProof);
    const recursiveVkConfigured = isNonZeroField(privateHolderVkHash);
    const privateFsftProofMode = Boolean(hasPrivateHolderProof)
      ? recursiveVkConfigured
        ? "recursive-verified"
        : "aztec-private-proven"
      : "none";
    if (!hasDepositTicket && !hasFsftExposure) {
      return NextResponse.json(
        {
          error: "Voting requires an active position: a deposit or FSFT holdings.",
          eligibility: {
            investorRole: true,
            hasDepositTicket,
            hasFsftExposure,
            hasPrivateHolderProof: Boolean(hasPrivateHolderProof),
            privateFsftProofMode,
            recursiveVkConfigured,
            reason: "No deposit or FSFT position found for this account.",
          },
        },
        { status: 403 }
      );
    }

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    const receipt = await govContract.methods
      .cast_vote(Number(proposalId), Boolean(voteYes))
      .send({ from: accountAddress });

    return NextResponse.json({
      success: true,
      message: `Vote on proposal #${proposalId} recorded`,
      txHash: (() => { const txHash = receipt.txHash?.toString(); if (!txHash) { throw new Error("Transaction receipt missing txHash"); } return txHash; })(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/vote]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
