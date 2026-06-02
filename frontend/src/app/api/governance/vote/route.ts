import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simCastVote } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult, isDuplicateNullifierError } from "@/lib/aztecSim";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, proposalId, voteYes } = await request.json();

  if (!address || proposalId === undefined || voteYes === undefined) {
    return NextResponse.json({ error: "address, proposalId and voteYes required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const result = simCastVote(address, Number(proposalId), Boolean(voteYes));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Vote on proposal #${proposalId} recorded (simulation)`,
    });
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
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);

    // V2: fetch hinted KYC credential + hinted deposit note from caller's
    // PXE. cast_vote_private requires both: KYC for eligibility, deposit
    // note for fund-exposure proof. Both are kernel-verified inside the
    // private circuit; voter identity is not revealed publicly.
    const credentialsResult = simResult<{ len: bigint; storage: unknown[] }>(
      await kycContract.methods.get_my_kyc_credentials(userAddress, 0).simulate({ from: accountAddress })
    );
    if (credentialsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private KYC credential found. Re-run /api/kyc/register first." },
        { status: 403 }
      );
    }
    const hintedKycNote = credentialsResult.storage[0];

    const depositsResult = simResult<{ len: bigint; storage: unknown[] }>(
      await hfContract.methods.get_my_deposit_notes(userAddress, 0).simulate({ from: accountAddress })
    );
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        {
          error: "No private DepositNote found. /api/fund/deposit at least once before voting (fund exposure required).",
        },
        { status: 403 }
      );
    }
    const hintedDepositNote = depositsResult.storage[0];

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    void fundTokenAddr; // legacy V1 readonly probe removed; kept env-var required so missing config errors stay actionable

    const receipt = await govContract.methods
      .cast_vote_private(Number(proposalId), Boolean(voteYes), hintedKycNote, hintedDepositNote)
      .send({ from: accountAddress });

    return NextResponse.json({
      success: true,
      message: `Private vote on proposal #${proposalId} recorded`,
      txHash: requireAztecTxHash(receipt),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/vote]", msg);
    if (isDuplicateNullifierError(msg)) {
      return NextResponse.json(
        { error: "You have already voted on this proposal. Each account can vote once per proposal." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
