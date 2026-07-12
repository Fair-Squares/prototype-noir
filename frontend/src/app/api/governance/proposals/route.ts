import { NextRequest, NextResponse } from "next/server";
import { getBlockNumber } from "@/lib/aztecClient";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { getAztecTxHash, getAztecTxOutcome } from "@/lib/txHash";
import { simResult, humanizeContractError } from "@/lib/aztecSim";
import {
  simGetProposals,
  simGetListings,
  simCreateProposal,
  simCreateProposalFromListing,
  simSetCovenant,
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

// -- GET: list proposals ------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!isLiveModeEnabled()) {
    const listings = simGetListings();
    const proposals = simGetProposals().map((proposal) => {
      const totalVotes = proposal.yesVotes + proposal.noVotes;
      const claimableAmount = address ? simGetClaimableAmount(proposal.id, address) : 0;
      const hasClaimed = address ? proposal.claimedBy.includes(address) : false;
      // J4: listing back-reference — listing-backed proposals fund via the
      // matching queue, not admin execution.
      const backingListing = listings.find((l) => l.proposalId === proposal.id);
      return {
        ...proposal,
        // Sim deadlines are unix SECONDS, not block heights. Mark them so
        // votingWindowFor compares against wall-clock (and the UI never
        // renders the timestamp as a block number).
        deadlineKind: "timestamp" as const,
        totalVotes,
        quorumReached: totalVotes >= proposal.quorumRequired,
        claimableAmount,
        hasClaimed,
        listingId: backingListing ? backingListing.id : null,
      };
    });
    return NextResponse.json({ proposals, source: "simulation" });
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

    const [reader, GovArtifactJson, HfArtifactJson] = await Promise.all([
      getTestAccount(accountIndex),
      loadGeneratedArtifactJson("governance-Governance.json"),
      loadGeneratedArtifactJson("housing_fund-HousingFund.json"),
    ]);
    const wallet = reader.wallet;
    const from = AztecAddress.fromString(reader.address);

    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);

    const [govContract, hfContract] = await Promise.all([
      Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet),
      Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet),
    ]);

    const [count, currentBlock, quorum] = await Promise.all([
      govContract.methods.get_proposal_count().simulate({ from }).then((r) => Number(simResult(r))),
      getBlockNumber(),
      govContract.methods.get_min_quorum_votes().simulate({ from }).then((r) => Number(simResult(r))),
    ]);
    const requestedAddress = address ? AztecAddress.fromString(address) : null;

    // Live private deposits are invisible to the public-record claimable path
    // below (get_my_deposit_record_count is 0 for deposit_private holders), so
    // flag whether the connected account holds ANY private deposit note. The UI
    // uses this to show a "claim to receive your private share" prompt instead
    // of a misleading €0 claimable. Read once — it is the same across proposals.
    let hasPrivateDeposits = false;
    if (requestedAddress) {
      const privateNotes = simResult<{ len: bigint }>(
        await hfContract.methods.get_my_deposit_notes(requestedAddress, 0).simulate({ from })
      );
      hasPrivateDeposits = BigInt(privateNotes.len) > 0n;
    }

    const proposals = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const [proposal, distribution, covenantRaw, listingPlusOne] = await Promise.all([
          govContract.methods.get_proposal(id).simulate({ from }).then((r) =>
            simResult<{
              desc_hash: bigint;
              amount: bigint;
              yes_votes: bigint;
              no_votes: bigint;
              status: bigint;
              created_block: bigint;
              deadline_block: bigint;
            }>(r)
          ),
          hfContract.methods.get_distribution_status(id).simulate({ from }).then((r) =>
            simResult<{
              open: boolean;
              amount: bigint;
              snapshot_total: bigint;
              small_total: bigint;
              small_pool: bigint;
              fifo_cap: bigint;
              claimed_total: bigint;
            }>(r)
          ),
          // W1: the on-chain affordability covenant (is_set=false when none attached).
          govContract.methods.get_proposal_covenant(id).simulate({ from }).then((r) =>
            simResult<{
              rent_ceiling_bps: bigint;
              lock_years: bigint;
              target_group: bigint;
              is_set: boolean;
            }>(r)
          ),
          // J4: listing back-reference (listing_id + 1; 0 = legacy direct
          // proposal). Listing-backed proposals fund via the matching queue,
          // not admin execution — the UI branches on this.
          govContract.methods.get_proposal_listing_id_plus_one(id).simulate({ from }).then((r) =>
            Number(simResult(r))
          ),
        ]);

        const descHash = toBigIntStrict(proposal.desc_hash, `Governance.get_proposal(${id}).desc_hash`);
        const amount = Number(toBigIntStrict(proposal.amount, `Governance.get_proposal(${id}).amount`));
        const yesVotes = Number(toBigIntStrict(proposal.yes_votes, `Governance.get_proposal(${id}).yes_votes`));
        const noVotes = Number(toBigIntStrict(proposal.no_votes, `Governance.get_proposal(${id}).no_votes`));
        const status = Number(toBigIntStrict(proposal.status, `Governance.get_proposal(${id}).status`));
        const createdBlock = Number(toBigIntStrict(proposal.created_block, `Governance.get_proposal(${id}).created_block`));
        const deadlineBlock = Number(toBigIntStrict(proposal.deadline_block, `Governance.get_proposal(${id}).deadline_block`));
        const totalVotes = yesVotes + noVotes;

        const distributionOpened = Boolean(distribution.open);
        const distributionAmount = Number(
          toBigIntStrict(distribution.amount, `HousingFund.get_distribution_status(${id}).amount`)
        );
        const distributionSnapshotDeposits = Number(
          toBigIntStrict(distribution.snapshot_total, `HousingFund.get_distribution_status(${id}).snapshot_total`)
        );
        const distributionClaimed = Number(
          toBigIntStrict(distribution.claimed_total, `HousingFund.get_distribution_status(${id}).claimed_total`)
        );

        // V2: public claims are PER deposit record (by global seq). Aggregate
        // the requesting investor's public records: claimableAmount is the sum
        // of the still-unclaimed per-record shares; hasClaimed is true only
        // once EVERY one of their records has been claimed for this proposal.
        let hasClaimed = false;
        let claimableAmount = 0;
        if (requestedAddress) {
          const recordCount = Number(
            toBigIntStrict(
              simResult(await hfContract.methods.get_my_deposit_record_count(requestedAddress).simulate({ from })),
              `HousingFund.get_my_deposit_record_count(${id})`
            )
          );
          if (recordCount > 0) {
            const records = await Promise.all(
              Array.from({ length: recordCount }, async (__, index) => {
                const record = simResult<{
                  seq: bigint;
                  amount: bigint;
                  cum_before: bigint;
                  is_small: boolean;
                }>(await hfContract.methods.get_my_deposit_record(requestedAddress, index).simulate({ from }));
                const seq = toBigIntStrict(record.seq, `HousingFund.get_my_deposit_record(${id},${index}).seq`);
                const [recordClaimedRaw, claimableRaw] = await Promise.all([
                  hfContract.methods.has_claimed(id, requestedAddress, seq).simulate({ from }),
                  hfContract.methods.get_claimable_amount(id, requestedAddress, seq).simulate({ from }),
                ]);
                const recordClaimed = Boolean(simResult(recordClaimedRaw));
                const claimable = recordClaimed
                  ? 0
                  : Number(
                      toBigIntStrict(
                        simResult(claimableRaw),
                        `HousingFund.get_claimable_amount(${id},${seq})`
                      )
                    );
                return { recordClaimed, claimable };
              })
            );
            let allClaimed = true;
            for (const { recordClaimed, claimable } of records) {
              if (!recordClaimed) {
                allClaimed = false;
                claimableAmount += claimable;
              }
            }
            hasClaimed = allClaimed;
          }
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
          hasPrivateDeposits,
          listingId: listingPlusOne > 0 ? listingPlusOne - 1 : null,
          covenant: covenantRaw.is_set
            ? {
                isSet: true,
                rentCeilingBps: Number(
                  toBigIntStrict(covenantRaw.rent_ceiling_bps, `Governance.get_proposal_covenant(${id}).rent_ceiling_bps`)
                ),
                lockYears: Number(
                  toBigIntStrict(covenantRaw.lock_years, `Governance.get_proposal_covenant(${id}).lock_years`)
                ),
              }
            : undefined,
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

  if (!isLiveModeEnabled()) {
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

    // J1: open the investor vote on a council-approved listing (the ask is
    // inherited from the listing — amount is deliberately not a parameter).
    if (action === "create_from_listing") {
      const { listingId } = body;
      if (listingId === undefined || !title) {
        return NextResponse.json({ error: "listingId and title required" }, { status: 400 });
      }
      const result = simCreateProposalFromListing(
        address ?? "0x0",
        Number(listingId),
        title,
        description ?? ""
      );
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, proposal: result.proposal });
    }

    // W1/J3: sim covenant attach, mirroring Governance.set_proposal_covenant
    // including the listing-backed affordability-baseline check.
    if (action === "set_covenant") {
      const { rentCeilingBps, lockYears } = body;
      if (rentCeilingBps == null || lockYears == null) {
        return NextResponse.json({ error: "rentCeilingBps, lockYears required" }, { status: 400 });
      }
      const result = simSetCovenant(
        address ?? "0x0",
        Number(proposalId),
        Number(rentCeilingBps),
        Number(lockYears)
      );
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, message: "Covenant attached" });
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
      const isInvestor = simResult(await kycContract.methods.is_investor(actorAddress).simulate({ from: actorAddress }));
      if (!Boolean(isInvestor)) {
        return NextResponse.json({ error: "Investor role required to create proposals" }, { status: 403 });
      }

      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal(descHash, BigInt(amount))
        .send({ from: actorAddress });

      // Mirror the other actions below: a mined create can still revert in the
      // public leg — never report a proposal that does not exist as created.
      const createOutcome = getAztecTxOutcome(receipt);
      if (createOutcome.reverted) {
        const mapped = humanizeContractError(createOutcome.error ?? "");
        if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
        return NextResponse.json(
          { error: `Proposal creation reverted: ${createOutcome.error ?? "see contract assertion."}` },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Proposal \"${title}\" created`,
        txHash: createOutcome.txHash,
      });
    }

    // J1: open the investor vote on a council-approved listing. The contract
    // inherits the ask from the listing and flips it to PROPOSED, so the only
    // inputs are the listing id and the human title for the desc hash.
    if (action === "create_from_listing") {
      const { listingId } = body;
      if (listingId === undefined || !title) {
        return NextResponse.json({ error: "listingId and title required" }, { status: 400 });
      }
      const actorAddress = AztecAddress.fromString(actor.address);
      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal_from_listing(Number(listingId), descHash)
        .send({ from: actorAddress });
      const outcome = getAztecTxOutcome(receipt);
      if (outcome.reverted) {
        const mapped = humanizeContractError(outcome.error ?? "");
        if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
        return NextResponse.json(
          { error: `Proposal creation from listing reverted: ${outcome.error ?? "see contract assertion."}` },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        message: `Investor vote opened for \"${title}\"`,
        txHash: outcome.txHash,
      });
    }

    if (action === "finalize") {
      const receipt = await govContract.methods
        .finalize_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(actor.address) });
      const outcome = getAztecTxOutcome(receipt);
      if (outcome.reverted) {
        const mapped = humanizeContractError(outcome.error ?? "");
        if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
        return NextResponse.json(
          { error: `Finalisation reverted: ${outcome.error ?? "see contract assertion."}` },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, txHash: outcome.txHash });
    }

    if (action === "execute") {
      if (!housingFundAddr) {
        return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS is required" }, { status: 500 });
      }
      // execute_proposal is ADMIN-GATED (governance/main.nr: assert msg_sender ==
      // admin), and the seed flow runs this step as the protocol admin (test0).
      // Progressing a passed proposal to "executed + distribution opened" is an
      // OPERATOR action, not a per-user one — so route it through the admin account
      // regardless of which account is connected. Without this, a non-admin caller
      // reverts "not admin". (open_distribution is permissionless, but we run it as
      // the same admin actor for a single coherent operator step.) Demo-only: the
      // server holds every key — see the serverWallet M16 note.
      const admin = await getTestAccount(0);
      const adminAddress = AztecAddress.fromString(admin.address);
      const govAsAdmin = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, admin.wallet);
      const hfAsAdmin = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, admin.wallet);

      const executeReceipt = await govAsAdmin.methods
        .execute_proposal(Number(proposalId))
        .send({ from: adminAddress });
      const executeOutcome = getAztecTxOutcome(executeReceipt);
      if (executeOutcome.reverted) {
        const mapped = humanizeContractError(executeOutcome.error ?? "");
        if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
        return NextResponse.json(
          { error: `Execution reverted: ${executeOutcome.error ?? "see contract assertion."}` },
          { status: 409 }
        );
      }
      const openReceipt = await hfAsAdmin.methods
        .open_distribution(Number(proposalId))
        .send({ from: adminAddress });
      const openOutcome = getAztecTxOutcome(openReceipt);
      if (openOutcome.reverted) {
        return NextResponse.json(
          { error: `Distribution could not be opened: ${openOutcome.error ?? "the open_distribution tail reverted."}` },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        txHash: executeOutcome.txHash,
        openDistributionTxHash: openOutcome.txHash,
        message: "Proposal executed and distribution opened",
      });
    }

    // W1: attach the affordability covenant to a proposal (proposer-only,
    // once-only, before any vote is cast — see Governance.set_proposal_covenant).
    if (action === "set_covenant") {
      const { rentCeilingBps, lockYears, targetGroup = 0 } = body;
      if (rentCeilingBps == null || lockYears == null) {
        return NextResponse.json(
          { error: "rentCeilingBps, lockYears required" },
          { status: 400 }
        );
      }
      const receipt = await govContract.methods
        .set_proposal_covenant(
          Number(proposalId),
          Number(rentCeilingBps),
          Number(lockYears),
          BigInt(targetGroup)
        )
        .send({ from: AztecAddress.fromString(actor.address) });
      const outcome = getAztecTxOutcome(receipt);
      if (outcome.reverted) {
        const mapped = humanizeContractError(outcome.error ?? "");
        if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
        return NextResponse.json(
          { error: `set_covenant reverted: ${outcome.error ?? "see contract assertion."}` },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, txHash: outcome.txHash });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/proposals]", msg);
    // finalize/execute assertions (quorum, voting window, status) throw at
    // simulation time — map them to clear copy instead of leaking the raw Noir
    // assertion (e.g. "Assertion failed: quorum not reached ...").
    const mapped = humanizeContractError(msg);
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
