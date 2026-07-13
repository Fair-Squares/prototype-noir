import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
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
  if (!isLiveModeEnabled()) {
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

  // ── Live mode: call is_verified() utility function on KYCVerifier ────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!kycAddr) {
      return NextResponse.json({
        verified: false,
        isInvestor: false,
        isPropertyOwner: false,
        isCouncil: false,
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
    // Module imports + the admin wallet load are independent of each other.
    const [
      { getTestAccount },
      { Contract },
      { loadContractArtifact },
      { AztecAddress },
      { loadGeneratedArtifactJson },
    ] = await Promise.all([
      import("@/lib/serverWallet"),
      import("@aztec/aztec.js/contracts"),
      import("@aztec/aztec.js/abi"),
      import("@aztec/aztec.js/addresses"),
      import("@/lib/artifactLoader"),
    ]);
    const admin = await getTestAccount(0);
    const wallet = admin.wallet;

    const userAddress = AztecAddress.fromString(address);
    // Read the user's OWN private notes from their account scope. Simulating
    // from the admin would not see another account's credential / deposit
    // notes, so we use the queried address (all local test accounts are
    // registered in the server PXE) as the `from` for these reads.
    const readFrom = userAddress;

    // All artifact loads are independent (memoized loader is concurrency-safe),
    // as are the three Contract.at instantiations once the wallet exists. The
    // HF/FT block is gated on env vars, not on the KYC result, so it runs
    // alongside the KYC read rather than after it.
    const hasHfFt = Boolean(housingFundAddr && fundTokenAddr);
    const [KycArtifactJson, HfArtifactJson, FtArtifactJson] = await Promise.all([
      loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json"),
      hasHfFt ? loadGeneratedArtifactJson("housing_fund-HousingFund.json") : Promise.resolve(null),
      hasHfFt ? loadGeneratedArtifactJson("token_contract-Token.json") : Promise.resolve(null),
    ]);
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const [kycContract, hfContract, ftContract] = await Promise.all([
      Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet),
      hasHfFt
        ? Contract.at(
            AztecAddress.fromString(housingFundAddr),
            loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]),
            wallet
          )
        : Promise.resolve(null),
      hasHfFt
        ? Contract.at(
            AztecAddress.fromString(fundTokenAddr),
            loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]),
            wallet
          )
        : Promise.resolve(null),
    ]);

    // V2: a user is "verified investor" iff they own a non-revoked KYC
    // credential note. Replaces the V1 public is_verified / is_investor
    // map lookups, which leaked address→KYC linkage in public state.
    // V2: deposit-ticket existence = "does the user own ≥1 DepositNote?"
    // FSFT exposure uses the AIP-20 token's public balance check. The V2
    // token has no private-holder-proof primitive, so exposure is the
    // public balance alone. All three reads are independent.
    const [credentialsRaw, depositNotesRaw, fsftPublicBalance, ownerRaw, councilRaw] = await Promise.all([
      kycContract.methods.get_my_kyc_credentials(userAddress, 0).simulate({ from: readFrom }),
      hasHfFt
        ? hfContract!.methods.get_my_deposit_notes(userAddress, 0).simulate({ from: readFrom })
        : Promise.resolve(null),
      hasHfFt
        ? ftContract!.methods.balance_of_public(userAddress).simulate({ from: readFrom })
        : Promise.resolve(null),
      // J1/J2 journey roles: public #[view] maps (transparency-mode by design).
      kycContract.methods.is_property_owner(userAddress).simulate({ from: readFrom }),
      kycContract.methods.is_council(userAddress).simulate({ from: readFrom }),
    ]);

    const credentialsResult = simResult<{ len: bigint }>(credentialsRaw);
    const isInvestor = credentialsResult.len > 0n;
    const verified = isInvestor;
    const isPropertyOwner = Boolean(simResult(ownerRaw));
    const isCouncil = Boolean(simResult(councilRaw));
    const roles: string[] = [];
    if (isInvestor) roles.push("investor");
    if (isPropertyOwner) roles.push("property owner");
    if (isCouncil) roles.push("council");

    let hasDepositTicket = false;
    let hasFsftExposure = false;
    if (hasHfFt) {
      const depositNotesResult = simResult<{ len: bigint }>(depositNotesRaw);
      hasDepositTicket = depositNotesResult.len > 0n;
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
      isPropertyOwner,
      isCouncil,
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
