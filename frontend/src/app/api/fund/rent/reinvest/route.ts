import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simReinvestRent } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult, isDuplicateNullifierError } from "@/lib/aztecSim";

// Mirror of the contract's allocation math (HousingFund.total_claim) so the
// route can stamp the new deposit note's is_small bit (= share <= threshold).
// Integer/bigint, identical to fifo_share + small_share in the circuit.
function fifoShare(cumBefore: bigint, amount: bigint, fifoCap: bigint): bigint {
  if (cumBefore >= fifoCap) return 0n;
  const hi = cumBefore + amount;
  return (hi < fifoCap ? hi : fifoCap) - cumBefore;
}
function smallShare(amount: bigint, isSmall: boolean, smallPool: bigint, smallTotal: bigint): bigint {
  if (!isSmall || smallTotal === 0n) return 0n;
  return (smallPool * amount) / smallTotal;
}

/**
 * POST /api/fund/rent/reinvest — REINVEST claimable rent back into the fund as
 * fresh capital (the reinvest side of the choice). Sim: simReinvestRent (rent ->
 * deposit, NAV grows). Live: HousingFund.reinvest_rent_private — claims the
 * caller's rent for an open epoch and mints a NEW private DepositNote for the
 * share (no EUR moves). The share is recomputed here to stamp the new note's
 * FIFO cursors (supplied-then-verified in the contract tail).
 *
 * NOTE (single-note): reinvests against the caller's FIRST deposit note only,
 * matching the repo's claim_distribution posture; multi-note is a uniform
 * follow-up (also needs per-note cursor re-reads). Untested against a live stack.
 *
 * Body: { accountIndex?: number, address?: string, rentEpochId?: number }
 */
export async function POST(request: NextRequest) {
  const { accountIndex = 0, address, rentEpochId = 0 } = await request.json();

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simReinvestRent(address ?? "0x0");
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      reinvested: result.reinvested ?? 0,
      txHash: `sim_rent_reinvest_${Date.now()}`,
      message: `Reinvested €${(result.reinvested ?? 0).toLocaleString()} rent into the fund (simulation)`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: reinvest_rent_private ───────────────────────────────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
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
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, actor.wallet);
    const actorAddress = AztecAddress.fromString(actor.address);

    const epoch = Number(rentEpochId);
    const status = simResult<{
      open: boolean;
      small_total: bigint;
      small_pool: bigint;
      fifo_cap: bigint;
    }>(await hfContract.methods.get_rent_distribution_status(epoch).simulate({ from: actorAddress }));
    if (!status.open) {
      return NextResponse.json(
        { error: `Rent epoch ${epoch} is not open. A keeper must open_rent_distribution first.` },
        { status: 400 }
      );
    }

    const notes = simResult<{ len: bigint; storage: Array<{ note?: { amount?: bigint; cum_before?: bigint; is_small?: boolean } }> }>(
      await hfContract.methods.get_my_deposit_notes(actorAddress, 0).simulate({ from: actorAddress })
    );
    if (notes.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit note for this account; deposit before reinvesting rent." },
        { status: 403 }
      );
    }
    const hintedNote = notes.storage[0];
    const noteAmount = BigInt(hintedNote?.note?.amount ?? 0n);
    const noteCumBefore = BigInt(hintedNote?.note?.cum_before ?? 0n);
    const noteIsSmall = Boolean(hintedNote?.note?.is_small);

    const smallPool = BigInt(status.small_pool);
    const smallTotal = BigInt(status.small_total);
    const fifoCap = BigInt(status.fifo_cap);
    const share =
      fifoShare(noteCumBefore, noteAmount, fifoCap) + smallShare(noteAmount, noteIsSmall, smallPool, smallTotal);
    if (share <= 0n) {
      return NextResponse.json({ error: "No claimable rent for this note/epoch." }, { status: 400 });
    }

    // New-note FIFO cursors: stamped at the live cursor, verified in the tail.
    const cursor = simResult<{ cum_deposits: bigint; deposit_seq: bigint; small_threshold: bigint }>(
      await hfContract.methods.get_deposit_cursor_unconstrained().simulate({ from: actorAddress })
    );
    const newIsSmall = share <= BigInt(cursor.small_threshold);

    const receipt = await hfContract.methods
      .reinvest_rent_private(
        epoch,
        hintedNote,
        smallPool,
        smallTotal,
        fifoCap,
        BigInt(cursor.cum_deposits),
        BigInt(cursor.deposit_seq),
        newIsSmall,
      )
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      reinvested: Number(share),
      txHash: requireAztecTxHash(receipt),
      message: `Reinvested €${Number(share).toLocaleString()} rent into the fund`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/rent/reinvest]", msg);
    if (isDuplicateNullifierError(msg)) {
      return NextResponse.json({ error: "You have already claimed or reinvested rent for this epoch." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
