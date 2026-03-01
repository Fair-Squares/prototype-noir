import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetKYCProfile, simGetVotingEligibility } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const profile = simGetKYCProfile(address);
    const eligibility = simGetVotingEligibility(address);
    return NextResponse.json({
      ...profile,
      canTradeDex: profile.isInvestor,
      canVote: eligibility.canVote,
      voteEligibilityReason: eligibility.reason,
      hasDepositTicket: eligibility.hasDepositTicket,
      hasFsftExposure: eligibility.hasFsftExposure,
      rewardsEligible: profile.isInvestor && (eligibility.hasDepositTicket || eligibility.hasFsftExposure),
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: call is_verified() utility function on KYCVerifier ────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!kycAddr) {
      return NextResponse.json({
        verified: false,
        isInvestor: false,
        roles: [],
        canTradeDex: false,
        canVote: false,
        voteEligibilityReason: "KYC contract not configured",
        hasDepositTicket: false,
        hasFsftExposure: false,
        rewardsEligible: false,
        source: "live",
      });
    }

    // Use admin wallet to query (utility functions are read-only, no signing needed)
    const { getTestAccount } = await import("@/lib/serverWallet");
    const admin = await getTestAccount(0);
    const wallet = admin.wallet;

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const from = AztecAddress.fromString(admin.address);
    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);

    const userAddress = AztecAddress.fromString(address);
    const verified = await kycContract.methods
      .is_verified(AztecAddress.fromString(address))
      .simulate({ from });
    const isInvestor = await kycContract.methods
      .is_investor(userAddress)
      .simulate({ from });
    const roles: string[] = [];
    if (Boolean(isInvestor)) roles.push("investor");

    let hasDepositTicket = false;
    let hasFsftExposure = false;
    if (housingFundAddr && fundTokenAddr) {
      const [HfArtifactJson, FtArtifactJson] = await Promise.all([
        loadGeneratedArtifactJson("housing_fund-HousingFund.json"),
        loadGeneratedArtifactJson("fund_token-FundToken.json"),
      ]);
      const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
      const [depositTicket, fsftPublicBalance, hasPrivateHolderProof] = await Promise.all([
        hfContract.methods.get_user_deposit_ticket(userAddress).simulate({ from }),
        ftContract.methods.public_balance_of(userAddress).simulate({ from }),
        ftContract.methods.has_private_holder_proof(userAddress).simulate({ from }),
      ]);
      hasDepositTicket = Number(depositTicket) > 0;
      hasFsftExposure = Number(fsftPublicBalance) > 0 || Boolean(hasPrivateHolderProof);
    }
    const canVote = Boolean(isInvestor) && (hasDepositTicket || hasFsftExposure);
    const voteEligibilityReason = !Boolean(isInvestor)
      ? "Investor role required. Complete KYC first."
      : canVote
      ? "Eligible to vote."
      : "Voting requires fund exposure: deposit ticket, FSFT holding, or private-holder proof.";

    return NextResponse.json({
      verified: Boolean(verified),
      isInvestor: Boolean(isInvestor),
      roles,
      canTradeDex: Boolean(isInvestor),
      canVote,
      voteEligibilityReason,
      hasDepositTicket,
      hasFsftExposure,
      rewardsEligible: Boolean(isInvestor) && (hasDepositTicket || hasFsftExposure),
      source: "live",
    });
  } catch (error) {
    console.error("[kyc/status] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live KYC status" }, { status: 500 });
  }
}
