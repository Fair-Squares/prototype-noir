import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";
import { simGetFundingQueue, simMatchNext } from "@/lib/simulationStore";

// J4: the funding queue — PASSED listing-backed proposals awaiting capital,
// ranked by council quality score, then covenant discount depth, then FIFO
// (Governance.get_proposal_priority_public packs score * 1e9 + discount).
// GET enumerates the queue; POST {action:"match_next"} cranks the
// permissionless HousingFund.match_next().

interface QueueEntry {
  proposalId: number;
  listingId: number;
  askEur: number;
  marketRentRefEur: number;
  qualityScore: number;
  discountEur: number;
  fundable: boolean;
}

function toNum(value: unknown, fieldName: string): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value ?? NaN);
  if (!Number.isFinite(n)) throw new Error(`${fieldName} is not a finite number`);
  return n;
}

/** Unpack Governance.get_proposal_priority_public: score * 1e9 + discount. */
function unpackPriority(priority: number): { qualityScore: number; discountEur: number } {
  return {
    qualityScore: Math.floor(priority / 1_000_000_000),
    discountEur: priority % 1_000_000_000,
  };
}

/** The entry match_next would fund: best priority among fundable, FIFO ties. */
function expectedWinner(entries: QueueEntry[]): QueueEntry | null {
  let best: QueueEntry | null = null;
  for (const e of entries) {
    if (!e.fundable) continue;
    const p = e.qualityScore * 1_000_000_000 + Math.min(e.discountEur, 999_999_999);
    const bestP = best
      ? best.qualityScore * 1_000_000_000 + Math.min(best.discountEur, 999_999_999)
      : -1;
    if (p > bestP) best = e;
  }
  return best;
}

async function readLiveQueue() {
  const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
  const hfAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
  if (!govAddr || !hfAddr) {
    throw new Error("NEXT_PUBLIC_GOVERNANCE_ADDRESS and NEXT_PUBLIC_HOUSING_FUND_ADDRESS must be set");
  }

  const { getTestAccount } = await import("@/lib/serverWallet");
  const { Contract } = await import("@aztec/aztec.js/contracts");
  const { AztecAddress } = await import("@aztec/aztec.js/addresses");
  const { loadArtifact } = await import("@/lib/artifactLoader");

  const admin = await getTestAccount(0);
  const from = AztecAddress.fromString(admin.address);
  const [gov, hf] = await Promise.all([
    Contract.at(
      AztecAddress.fromString(govAddr),
      await loadArtifact("governance-Governance.json"),
      admin.wallet
    ),
    Contract.at(
      AztecAddress.fromString(hfAddr),
      await loadArtifact("housing_fund-HousingFund.json"),
      admin.wallet
    ),
  ]);

  const [head, tail, fundStats] = await Promise.all([
    gov.methods
      .get_funding_queue_head_public()
      .simulate({ from })
      .then((r) => toNum(simResult(r), "get_funding_queue_head_public")),
    gov.methods
      .get_funding_queue_tail_public()
      .simulate({ from })
      .then((r) => toNum(simResult(r), "get_funding_queue_tail_public")),
    hf.methods
      .get_fund_stats()
      .simulate({ from })
      .then((r) => simResult<{ available: bigint }>(r)),
  ]);
  const available = toNum(fundStats.available, "HousingFund.get_fund_stats.available");

  const entries: QueueEntry[] = [];
  for (let idx = head; idx < tail; idx++) {
    const pid = toNum(
      simResult(await gov.methods.get_funding_queue_entry_public(idx).simulate({ from })),
      `get_funding_queue_entry_public(${idx})`
    );
    const status = toNum(
      simResult(await gov.methods.get_proposal_status_public(pid).simulate({ from })),
      `get_proposal_status_public(${pid})`
    );
    if (status !== 1) continue; // settled (executed) — the head cursor will slide past

    const [amount, priority, listingPlusOne] = await Promise.all([
      gov.methods
        .get_proposal_amount_public(pid)
        .simulate({ from })
        .then((r) => toNum(simResult(r), `get_proposal_amount_public(${pid})`)),
      gov.methods
        .get_proposal_priority_public(pid)
        .simulate({ from })
        .then((r) => toNum(simResult(r), `get_proposal_priority_public(${pid})`)),
      gov.methods
        .get_proposal_listing_id_plus_one(pid)
        .simulate({ from })
        .then((r) => toNum(simResult(r), `get_proposal_listing_id_plus_one(${pid})`)),
    ]);
    const listingId = listingPlusOne - 1;
    const listingView = simResult<{ market_rent_ref_eur: bigint }>(
      await gov.methods.get_listing(listingId).simulate({ from })
    );
    const marketRentRefEur = toNum(
      listingView.market_rent_ref_eur,
      `get_listing(${listingId}).market_rent_ref_eur`
    );

    entries.push({
      proposalId: pid,
      listingId,
      askEur: amount,
      marketRentRefEur,
      ...unpackPriority(priority),
      fundable: amount <= available,
    });
  }

  return { entries, available, hf, from };
}

export async function GET() {
  if (!isLiveModeEnabled()) {
    const entries = simGetFundingQueue();
    return NextResponse.json({ queue: entries, source: "simulation" });
  }
  try {
    const { entries, available } = await readLiveQueue();
    return NextResponse.json({ queue: entries, available, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/queue GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body as { action?: string };
  if (action !== "match_next") {
    return NextResponse.json({ error: "action must be 'match_next'" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    const result = simMatchNext();
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({
      success: true,
      fundedProposalId: result.fundedProposalId,
      askEur: result.askEur,
      message: `Matched proposal #${result.fundedProposalId} (score ${result.qualityScore}) — acquisition recorded and distribution opened`,
      source: "simulation",
    });
  }

  try {
    const { entries, hf, from } = await readLiveQueue();
    // Deterministic pre-read of the winner (same selection the contract makes
    // in this tx; there is a single server wallet, so no concurrent matcher).
    const winner = expectedWinner(entries);

    const receipt = await hf.methods.match_next().send({ from });
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        { error: `match_next was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      fundedProposalId: winner?.proposalId ?? null,
      askEur: winner?.askEur ?? null,
      message:
        winner !== null
          ? `Matched proposal #${winner.proposalId} (score ${winner.qualityScore}) — acquisition recorded and distribution opened`
          : "Matching ran",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/queue POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
