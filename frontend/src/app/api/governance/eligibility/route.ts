import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simAttestFsftForVoting, simGetVotingEligibility } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json({ ...simGetVotingEligibility(address), source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";

    if (!kycAddr || !housingFundAddr || !fundTokenAddr) {
      return NextResponse.json(
        { error: "KYC, housing fund, and fund token addresses must be set" },
        { status: 500 }
      );
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actorAddress = AztecAddress.fromString(actor.address);
    const userAddress = AztecAddress.fromString(address);

    const [kycJson, hfJson, ftJson] = await Promise.all([
      loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json"),
      loadGeneratedArtifactJson("housing_fund-HousingFund.json"),
      loadGeneratedArtifactJson("token_contract-Token.json"),
    ]);

    const [kycContract, hfContract, ftContract] = await Promise.all([
      Contract.at(
        AztecAddress.fromString(kycAddr),
        loadContractArtifact(kycJson as Parameters<typeof loadContractArtifact>[0]),
        actor.wallet
      ),
      Contract.at(
        AztecAddress.fromString(housingFundAddr),
        loadContractArtifact(hfJson as Parameters<typeof loadContractArtifact>[0]),
        actor.wallet
      ),
      Contract.at(
        AztecAddress.fromString(fundTokenAddr),
        loadContractArtifact(ftJson as Parameters<typeof loadContractArtifact>[0]),
        actor.wallet
      ),
    ]);

    // V2 eligibility: count private notes instead of reading public maps.
    // FSFT exposure is now the AIP-20 public balance (balance_of_public > 0).
    const [credSim, depSim, fsftSim] = await Promise.all([
      kycContract.methods.get_my_kyc_credentials(userAddress, 0).simulate({ from: actorAddress }),
      hfContract.methods.get_my_deposit_notes(userAddress, 0).simulate({ from: actorAddress }),
      ftContract.methods.balance_of_public(userAddress).simulate({ from: actorAddress }),
    ]);

    const isInvestor = simResult<{ len: bigint }>(credSim).len > 0n;
    const hasDepositTicket = simResult<{ len: bigint }>(depSim).len > 0n;
    const hasFsftExposure = Number(simResult(fsftSim)) > 0;
    const canVote = isInvestor && (hasDepositTicket || hasFsftExposure);
    const privateFsftProofMode = hasFsftExposure ? "aztec-public-balance" : "none";

    return NextResponse.json({
      investorRole: Boolean(isInvestor),
      hasDepositTicket,
      hasFsftExposure,
      hasFsftVotingAttestation: hasFsftExposure,
      privateFsftProofMode,
      canVote,
      reason: !Boolean(isInvestor)
        ? "Investor role required. Complete KYC first."
        : canVote
        ? "Eligible to vote."
        : "Voting requires fund exposure: hold FSFT or have EUR deposited in the housing fund.",
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/eligibility]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, address, accountIndex = 0 } = body as {
    action?: string;
    address?: string;
    accountIndex?: number;
  };

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  if (action !== "attestFsftForVoting") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simAttestFsftForVoting(address);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: "FSFT voting eligibility recorded",
      privateFsftProofMode: "aztec-private-proven",
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
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!fundTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FUND_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    // AIP-20 migration: FSFT no longer exposes attest_private_holder(). Voting
    // eligibility is now derived directly from the public token balance
    // (balance_of_public > 0); there is no attestation tx to send.
    const FtArtifactJson = await loadGeneratedArtifactJson("token_contract-Token.json");
    const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, actor.wallet);

    const actorAddress = AztecAddress.fromString(actor.address);
    const userAddress = AztecAddress.fromString(address);
    const balance = Number(
      simResult(await ftContract.methods.balance_of_public(userAddress).simulate({ from: actorAddress }))
    );
    const hasFsftExposure = balance > 0;

    return NextResponse.json({
      success: true,
      message: hasFsftExposure
        ? "FSFT voting eligibility confirmed (public balance > 0)"
        : "No FSFT exposure: hold FSFT to gain voting eligibility.",
      hasFsftExposure,
      privateFsftProofMode: hasFsftExposure ? "aztec-public-balance" : "none",
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/eligibility attest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
