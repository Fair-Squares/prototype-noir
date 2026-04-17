import { NextRequest, NextResponse } from "next/server";
import { getBlockNumber } from "@/lib/aztecClient";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import {
  simGetProposals,
  simCreateProposal,
  simFinalizeProposal,
  simExecuteProposal,
  simOpenDistribution,
  simGetClaimableAmount,
} from "@/lib/simulationStore";

// -- Helpers -----------------------------------------------------------------

function toBigIntStrict(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} is not a finite number`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (value.startsWith("0x")) return BigInt(value);
    if (value.trim().length === 0) throw new Error(`${fieldName} is empty`);
    return BigInt(value);
  }
  if (value && typeof value === "object" && "toBigInt" in value) {
    return (value as { toBigInt: () => bigint }).toBigInt();
  }
  if (value && typeof value === "object" && "toString" in value) {
    const s = (value as { toString: () => string }).toString();
    if (!s) throw new Error(`${fieldName} is empty`);
    return s.startsWith("0x") ? BigInt(s) : BigInt(s);
  }
  throw new Error(`${fieldName} is not a bigint-compatible value`);
}

function expectTuple(value: unknown, expectedLength: number, methodName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${methodName} returned non-tuple response`);
  }
  if (value.length < expectedLength) {
    throw new Error(`${methodName} returned ${value.length} values, expected ${expectedLength}`);
  }
  return value;
}

// -- GET: list proposals ------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const proposals = simGetProposals().map((proposal) => {
      const totalVotes = proposal.yesVotes + proposal.noVotes;
      const claimableAmount = address ? simGetClaimableAmount(proposal.id, address) : 0;
      const hasClaimed = address ? proposal.claimedBy.includes(address) : false;
      return {
        ...proposal,
        totalVotes,
        quorumReached: totalVotes >= proposal.quorumRequired,
        claimableAmount,
        hasClaimed,
      };
    });
    return NextResponse.json({ proposals, source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const reader = await getTestAccount(accountIndex);
    const wallet = reader.wallet;
    const from = AztecAddress.fromString(reader.address);

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);

    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);

    const count = Number(await govContract.methods.get_proposal_count().simulate({ from }));
    const currentBlock = await getBlockNumber();
    const quorum = Number(await govContract.methods.get_min_quorum_votes().simulate({ from }));
    const requestedAddress = address ? AztecAddress.fromString(address) : null;

    const proposals = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const raw = await govContract.methods.get_proposal(id).simulate({ from });
        const tuple = expectTuple(raw, 7, `Governance.get_proposal(${id})`);

        const descHash = toBigIntStrict(tuple[0], `Governance.get_proposal(${id}).desc_hash`);
        const amount = Number(toBigIntStrict(tuple[1], `Governance.get_proposal(${id}).amount`));
        const yesVotes = Number(toBigIntStrict(tuple[2], `Governance.get_proposal(${id}).yes_votes`));
        const noVotes = Number(toBigIntStrict(tuple[3], `Governance.get_proposal(${id}).no_votes`));
        const status = Number(toBigIntStrict(tuple[4], `Governance.get_proposal(${id}).status`));
        const createdBlock = Number(toBigIntStrict(tuple[5], `Governance.get_proposal(${id}).created_block`));
        const deadlineBlock = Number(toBigIntStrict(tuple[6], `Governance.get_proposal(${id}).deadline_block`));
        const totalVotes = yesVotes + noVotes;

        const distributionRaw = await hfContract.methods
          .get_distribution_status(id)
          .simulate({ from });
        const distributionTuple = expectTuple(distributionRaw, 4, `HousingFund.get_distribution_status(${id})`);
        const distributionOpened = Boolean(distributionTuple[0]);
        const distributionAmount = Number(
          toBigIntStrict(distributionTuple[1], `HousingFund.get_distribution_status(${id}).amount`)
        );
        const distributionSnapshotDeposits = Number(
          toBigIntStrict(distributionTuple[2], `HousingFund.get_distribution_status(${id}).snapshot_total`)
        );
        const distributionClaimed = Number(
          toBigIntStrict(distributionTuple[3], `HousingFund.get_distribution_status(${id}).claimed_total`)
        );

        let hasClaimed = false;
        let claimableAmount = 0;
        if (requestedAddress) {
          hasClaimed = Boolean(
            await hfContract.methods.has_claimed(id, requestedAddress).simulate({ from })
          );
          claimableAmount = Number(
            await hfContract.methods.get_claimable_amount(id, requestedAddress).simulate({ from })
          );
        }

        return {
          id,
          descHash: "0x" + descHash.toString(16).padStart(64, "0"),
          amount,
          yesVotes,
          noVotes,
          status,
          title: `Proposal #${id}`,
          description: "On-chain proposal",
          createdAt: createdBlock,
          deadline: deadlineBlock,
          createdBlock,
          deadlineBlock,
          currentBlock,
          quorumRequired: quorum,
          totalVotes,
          quorumReached: totalVotes >= quorum,
          distributionOpened,
          distributionAmount,
          distributionSnapshotDeposits,
          distributionClaimed,
          hasClaimed,
          claimableAmount,
        };
      })
    );

    return NextResponse.json({ proposals, source: "live" });
  } catch (error) {
    console.error("[governance/proposals] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live governance proposals" }, { status: 500 });
  }
}

// -- POST: create, finalize, execute -----------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action = "create", title, description, amount, proposalId, accountIndex = 0, address } = body;

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      const result = simCreateProposal(
        address ?? "0x0",
        title,
        description ?? "",
        Number(amount)
      );
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, proposal: result.proposal });
    }

    if (action === "finalize") {
      const result = simFinalizeProposal(Number(proposalId));
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, message: "Proposal finalized" });
    }

    if (action === "execute") {
      const executeResult = simExecuteProposal(Number(proposalId));
      if (!executeResult.success) return NextResponse.json({ error: executeResult.error }, { status: 400 });
      const openResult = simOpenDistribution(Number(proposalId));
      if (!openResult.success) return NextResponse.json({ error: openResult.error }, { status: 400 });
      return NextResponse.json({
        success: true,
        message: "Proposal executed and distribution opened",
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
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

    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";

    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const actor = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);

    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, actor.wallet);

    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
      if (!kycAddr) {
        return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });
      }
      const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
      const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, actor.wallet);
      const actorAddress = AztecAddress.fromString(actor.address);
      const isInvestor = await kycContract.methods.is_investor(actorAddress).simulate({ from: actorAddress });
      if (!Boolean(isInvestor)) {
        return NextResponse.json({ error: "Investor role required to create proposals" }, { status: 403 });
      }

      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal(descHash, BigInt(amount))
        .send({ from: actorAddress });

      return NextResponse.json({
        success: true,
        message: `Proposal \"${title}\" created`,
        txHash: receipt.txHash?.toString(),
      });
    }

    if (action === "finalize") {
      const receipt = await govContract.methods
        .finalize_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(actor.address) });
      return NextResponse.json({ success: true, txHash: receipt.txHash?.toString() });
    }

    if (action === "execute") {
      if (!housingFundAddr) {
        return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS is required" }, { status: 500 });
      }
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, actor.wallet);

      const executeReceipt = await govContract.methods
        .execute_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(actor.address) });
      const openReceipt = await hfContract.methods
        .open_distribution(Number(proposalId))
        .send({ from: AztecAddress.fromString(actor.address) });

      return NextResponse.json({
        success: true,
        txHash: executeReceipt.txHash?.toString(),
        openDistributionTxHash: openReceipt.txHash?.toString(),
        message: "Proposal executed and distribution opened",
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/proposals]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
