import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simAttestFsftForVoting, simGetVotingEligibility } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

function isNonZeroField(value: unknown): boolean {
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0";
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString() !== "0";
  }
  return false;
}

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
      loadGeneratedArtifactJson("fund_token-FundToken.json"),
    ]);

    const kycContract = await Contract.at(
      AztecAddress.fromString(kycAddr),
      loadContractArtifact(kycJson as Parameters<typeof loadContractArtifact>[0]),
      actor.wallet
    );
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      loadContractArtifact(hfJson as Parameters<typeof loadContractArtifact>[0]),
      actor.wallet
    );
    const ftContract = await Contract.at(
      AztecAddress.fromString(fundTokenAddr),
      loadContractArtifact(ftJson as Parameters<typeof loadContractArtifact>[0]),
      actor.wallet
    );

    const [isInvestor, depositTicket, fsftBalance, hasPrivateHolderProof, privateHolderVkHash] = await Promise.all([
      kycContract.methods.is_investor(userAddress).simulate({ from: actorAddress }),
      hfContract.methods.get_user_deposit_ticket(userAddress).simulate({ from: actorAddress }),
      ftContract.methods.public_balance_of(userAddress).simulate({ from: actorAddress }),
      ftContract.methods.has_private_holder_proof(userAddress).simulate({ from: actorAddress }),
      ftContract.methods
        .get_private_holder_vk_hash()
        .simulate({ from: actorAddress }),
    ]);

    const hasDepositTicket = Number(depositTicket) > 0;
    const hasFsftExposure = Number(fsftBalance) > 0 || Boolean(hasPrivateHolderProof);
    const canVote = Boolean(isInvestor) && (hasDepositTicket || hasFsftExposure);
    const recursiveVkConfigured = isNonZeroField(privateHolderVkHash);
    const privateFsftProofMode = Boolean(hasPrivateHolderProof)
      ? recursiveVkConfigured
        ? "recursive-verified"
        : "aztec-private-proven"
      : "none";

    return NextResponse.json({
      investorRole: Boolean(isInvestor),
      hasDepositTicket,
      hasFsftExposure,
      hasFsftVotingAttestation: Boolean(hasPrivateHolderProof),
      privateFsftProofMode,
      recursiveVkConfigured,
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
  const { action, address, accountIndex = 0, recursiveProof } = body as {
    action?: string;
    address?: string;
    accountIndex?: number;
    recursiveProof?: {
      verificationKey?: unknown;
      proof?: unknown;
      publicInputs?: unknown;
    };
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
      message: "FSFT voting attestation recorded",
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

    const FtArtifactJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
    const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, actor.wallet);

    const actorAddress = AztecAddress.fromString(actor.address);
    const privateHolderVkHash = await ftContract.methods
      .get_private_holder_vk_hash()
      .simulate({ from: actorAddress });
    const recursiveVkConfigured = isNonZeroField(privateHolderVkHash);
    const requireRecursive = process.env.REQUIRE_RECURSIVE_PROOFS === "true";
    const hasRecursivePayload =
      Boolean(recursiveProof?.verificationKey) &&
      Boolean(recursiveProof?.proof) &&
      Array.isArray(recursiveProof?.publicInputs);

    if (requireRecursive && recursiveVkConfigured && !hasRecursivePayload) {
      return NextResponse.json(
        {
          error:
            "Recursive proof bundle required. Send recursiveProof={verificationKey, proof, publicInputs} in this request.",
        },
        { status: 400 }
      );
    }

    const receipt = hasRecursivePayload
      ? await ftContract.methods
          .attest_private_holder_recursive(
            privateHolderVkHash,
            recursiveProof!.verificationKey,
            recursiveProof!.proof,
            recursiveProof!.publicInputs
          )
          .send({ from: actorAddress })
      : await ftContract.methods.attest_private_holder().send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      message: hasRecursivePayload
        ? "Private FSFT holder proof generated with recursive verification"
        : recursiveVkConfigured
        ? "Private FSFT holder proof generated (recursive verifier is configured)"
        : "Private FSFT holder proof generated",
      txHash: requireAztecTxHash(receipt),
      privateFsftProofMode: hasRecursivePayload ? "recursive-verified" : "aztec-private-proven",
      recursiveVkConfigured,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/eligibility attest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
