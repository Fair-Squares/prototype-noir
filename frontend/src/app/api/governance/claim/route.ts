import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simClaimDistribution } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult, isDuplicateNullifierError } from "@/lib/aztecSim";

export async function POST(request: NextRequest) {
  const { proposalId, accountIndex = 0, address } = await request.json();

  if (proposalId === undefined) {
    return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    const result = simClaimDistribution(Number(proposalId), address ?? "0x0");
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimedAmount: result.claimedAmount ?? 0,
      txHash: `sim_claim_${Date.now()}`,
      message: "Distribution claimed (simulation)",
    });
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec-labs/aztec.js/abi");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
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
    const hfContract = await Contract.at(AztecAddress.fromStringUnsafe(housingFundAddr), hfArtifact, actor.wallet);
    const actorAddress = AztecAddress.fromStringUnsafe(actor.address);

    // V2 path: claim_distribution_private needs a hinted DepositNote the
    // caller already owns plus the per-proposal allocation snapshots
    // (small_pool, small_total, fifo_cap) AND the snapshot block — all of which
    // the public tail re-verifies against storage. The private circuit cannot
    // read public storage, so it binds the note to the snapshot block via
    // get_block_header_at(supplied_snapshot_block). The claimable share is
    // computed in-circuit from the kernel-verified note + these snapshots via
    // the FIFO/small-pool scheme.
    const depositsResult = simResult<{
      len: bigint;
      storage: unknown[];
    }>(await hfContract.methods.get_my_deposit_notes(actorAddress, 0).simulate({ from: actorAddress }));
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit note for this account; deposit before claiming." },
        { status: 403 }
      );
    }
    const status = simResult<{
      open: boolean;
      amount: bigint;
      snapshot_total: bigint;
      small_total: bigint;
      small_pool: bigint;
      fifo_cap: bigint;
      claimed_total: bigint;
      snapshot_block: bigint;
    }>(await hfContract.methods.get_distribution_status(Number(proposalId)).simulate({ from: actorAddress }));
    if (!status.open) {
      return NextResponse.json({ error: "Distribution not open for this proposal" }, { status: 400 });
    }
    if (BigInt(status.snapshot_total) === 0n) {
      return NextResponse.json({ error: "Distribution snapshot is zero" }, { status: 400 });
    }
    const suppliedSmallPool = BigInt(status.small_pool);
    const suppliedSmallTotal = BigInt(status.small_total);
    const suppliedFifoCap = BigInt(status.fifo_cap);
    // u32 on-chain; the claim circuit binds the note to this block header.
    const suppliedSnapshotBlock = Number(status.snapshot_block);

    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!fundTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FUND_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    // Multi-note: claim_distribution_private acts per (note, proposal) — the
    // claim nullifier is keyed by (note_hash, proposal_id), so a holder with
    // several private deposit notes must claim EACH note to receive their full
    // share (claiming only the first note strands the rest — the cause of the
    // "still unclaimed" remainder). Loop over all the caller's notes, mirroring
    // fund/rent/claim. A note already claimed reverts with a duplicate nullifier,
    // and a note with no share reverts/zeroes — both are skipped so the others
    // still claim. The contract's fail-closed ceiling keeps the total <= pool.
    const fundToken = AztecAddress.fromStringUnsafe(fundTokenAddr);
    let claimedNotes = 0;
    let lastTx: string | null = null;
    for (let i = 0; i < Number(depositsResult.len); i++) {
      try {
        const receipt = await hfContract.methods
          .claim_distribution_private(
            Number(proposalId),
            depositsResult.storage[i],
            fundToken,
            suppliedSmallPool,
            suppliedSmallTotal,
            suppliedFifoCap,
            suppliedSnapshotBlock,
          )
          .send({ from: actorAddress });
        const outcome = getAztecTxOutcome(receipt);
        // A per-note public-tail revert (already claimed elsewhere, or the pool
        // ceiling reached) just means this note can't add to the claim — skip it.
        if (outcome.reverted) continue;
        lastTx = outcome.txHash;
        claimedNotes++;
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        // Skip notes that can't contribute to THIS claim and keep going:
        //  - already claimed (duplicate nullifier),
        //  - zero share for this note,
        //  - deposited AFTER the distribution snapshot, so the note isn't in the
        //    tree at the anchor block ("note hash ... not found ... at anchor block").
        if (
          isDuplicateNullifierError(m) ||
          /share is zero|zero share/i.test(m) ||
          /not found in the note hash tree|note hash .*not found/i.test(m)
        ) {
          continue;
        }
        throw err;
      }
    }

    if (claimedNotes === 0) {
      return NextResponse.json(
        {
          error:
            "Nothing to claim — your deposit notes for this proposal are already claimed or have no share.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      // The claimed FSFT share is computed privately in-circuit and is not
      // returned by the tx, so we cannot report an exact amount here without
      // a separate private preview. Report null rather than a fabricated value.
      claimedAmount: null,
      notesClaimed: claimedNotes,
      txHash: lastTx,
      message: `Distribution claimed privately (${claimedNotes} deposit note${claimedNotes === 1 ? "" : "s"})`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/claim]", msg);
    if (isDuplicateNullifierError(msg)) {
      return NextResponse.json(
        { error: "You have already claimed this distribution." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
