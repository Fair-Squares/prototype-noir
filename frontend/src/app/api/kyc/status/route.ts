import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetKYCProfile, simGetVotingEligibility } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  // Live mode (AZTEC_LIVE=true) always reads on-chain — dev/sim only applies when
  // live mode is off, so the local stack doesn't fall back to simulated KYC data.
  const forceDevMode =
    !isLiveModeEnabled() &&
    (process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
      process.env.NEXT_PUBLIC_SIMULATION === "true");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── SDK dev-mode/testing profile ────────────────────────────────────────
  if (forceDevMode) {
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
      source: "dev",
    });
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
    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);

    const userAddress = AztecAddress.fromString(address);
    // Read the user's OWN private notes from their account scope. Simulating
    // from the admin would not see another account's credential / deposit
    // notes, so we use the queried address (all local test accounts are
    // registered in the server PXE) as the `from` for these reads.
    const readFrom = userAddress;
    // V2: a user is "verified investor" iff they own a non-revoked KYC
    // credential note. Replaces the V1 public is_verified / is_investor
    // map lookups, which leaked address→KYC linkage in public state.
    const credentialsResult = simResult<{ len: bigint }>(
      await kycContract.methods.get_my_kyc_credentials(userAddress, 0).simulate({ from: readFrom })
    );
    const isInvestor = credentialsResult.len > 0n;
    const verified = isInvestor;
    const roles: string[] = [];
    if (isInvestor) roles.push("investor");

    let hasDepositTicket = false;
    let hasFsftExposure = false;
    if (housingFundAddr && fundTokenAddr) {
      const [HfArtifactJson, FtArtifactJson] = await Promise.all([
        loadGeneratedArtifactJson("housing_fund-HousingFund.json"),
        loadGeneratedArtifactJson("token_contract-Token.json"),
      ]);
      const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
      // V2: deposit-ticket existence = "does the user own ≥1 DepositNote?"
      const depositNotesResult = simResult<{ len: bigint }>(
        await hfContract.methods.get_my_deposit_notes(userAddress, 0).simulate({ from: readFrom })
      );
      hasDepositTicket = depositNotesResult.len > 0n;
      // FSFT exposure uses the AIP-20 token's public balance check. The V2
      // token has no private-holder-proof primitive, so exposure is the
      // public balance alone.
      const fsftPublicBalance = await ftContract.methods
        .balance_of_public(userAddress)
        .simulate({ from: readFrom });
      hasFsftExposure = Number(simResult(fsftPublicBalance)) > 0;
    }
    const canVote = Boolean(isInvestor) && (hasDepositTicket || hasFsftExposure);
    const voteEligibilityReason = !Boolean(isInvestor)
      ? "Investor role required. Complete KYC first."
      : canVote
      ? "Eligible to vote."
      : "Voting requires an active position: a deposit or FSFT holdings.";

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
