import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult, humanizeContractError } from "@/lib/aztecSim";
import { simGetListings, simSubmitListing } from "@/lib/simulationStore";

// J1: property listings — the pre-proposal onboarding stage (journey step 2).
// GET lists every listing (Governance.get_listing_count + get_listing);
// POST submits a new listing as the selected account (owner-gated on-chain).

const LISTING_STATUS_NAMES: Record<number, string> = {
  1: "submitted",
  2: "council approved",
  3: "proposed",
  4: "rejected",
};

function toNum(value: unknown, fieldName: string): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value ?? NaN);
  if (!Number.isFinite(n)) throw new Error(`${fieldName} is not a finite number`);
  return n;
}

export async function GET() {
  if (!isLiveModeEnabled()) {
    const listings = simGetListings().map((l) => ({
      id: l.id,
      proposer: l.proposer,
      askEur: l.askEur,
      marketRentRefEur: l.marketRentRefEur,
      dossierHash: l.dossierHash,
      status: l.status,
      statusName: LISTING_STATUS_NAMES[l.status] ?? `unknown (${l.status})`,
      approvals: l.approvals,
      qualityScore: l.approvals > 0 ? Math.floor(l.scoreSum / l.approvals) : 0,
      proposalId: l.proposalId ?? null,
    }));
    return NextResponse.json({ listings, source: "simulation" });
  }

  try {
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadArtifact } = await import("@/lib/artifactLoader");

    const admin = await getTestAccount(0);
    const from = AztecAddress.fromStringUnsafe(admin.address);
    const gov = await Contract.at(
      AztecAddress.fromStringUnsafe(govAddr),
      await loadArtifact("governance-Governance.json"),
      admin.wallet
    );

    const count = toNum(
      simResult(await gov.methods.get_listing_count().simulate({ from })),
      "Governance.get_listing_count()"
    );

    const listings = await Promise.all(
      Array.from({ length: count }, (_, id) =>
        gov.methods
          .get_listing(id)
          .simulate({ from })
          .then((raw) => {
            const view = simResult<{
              proposer: { toString: () => string };
              ask_eur: bigint;
              market_rent_ref_eur: bigint;
              dossier_hash: bigint;
              status: bigint;
              approvals: bigint;
              quality_score: bigint;
            }>(raw);
            const status = toNum(view.status, `Governance.get_listing(${id}).status`);
            return {
              id,
              proposer: view.proposer.toString(),
              askEur: toNum(view.ask_eur, `Governance.get_listing(${id}).ask_eur`),
              marketRentRefEur: toNum(
                view.market_rent_ref_eur,
                `Governance.get_listing(${id}).market_rent_ref_eur`
              ),
              dossierHash: "0x" + BigInt(view.dossier_hash).toString(16).padStart(64, "0"),
              status,
              statusName: LISTING_STATUS_NAMES[status] ?? `unknown (${status})`,
              approvals: toNum(view.approvals, `Governance.get_listing(${id}).approvals`),
              qualityScore: toNum(view.quality_score, `Governance.get_listing(${id}).quality_score`),
              proposalId: null as number | null,
            };
          })
      )
    );

    // Attach the proposal back-reference for PROPOSED listings so the UI can
    // link a listing straight to its investor vote. One read per proposal;
    // proposal ids and listing ids are both dense sequences.
    const proposalCount = toNum(
      simResult(await gov.methods.get_proposal_count().simulate({ from })),
      "Governance.get_proposal_count()"
    );
    const backRefs = await Promise.all(
      Array.from({ length: proposalCount }, (_, pid) =>
        gov.methods
          .get_proposal_listing_id_plus_one(pid)
          .simulate({ from })
          .then((raw) => ({ pid, listingPlusOne: toNum(simResult(raw), "listing_id_plus_one") }))
      )
    );
    for (const { pid, listingPlusOne } of backRefs) {
      if (listingPlusOne > 0) {
        const listing = listings[listingPlusOne - 1];
        if (listing) listing.proposalId = pid;
      }
    }

    return NextResponse.json({ listings, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[property/listings GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, askEur, marketRentRefEur, dossierHash, accountIndex = 0 } = body as {
    address?: string;
    askEur?: number;
    marketRentRefEur?: number;
    dossierHash?: string;
    accountIndex?: number;
  };
  if (!address || !askEur || !marketRentRefEur || !dossierHash) {
    return NextResponse.json(
      { error: "address, askEur, marketRentRefEur and dossierHash are required" },
      { status: 400 }
    );
  }

  if (!isLiveModeEnabled()) {
    const result = simSubmitListing(address, Number(askEur), Number(marketRentRefEur), dossierHash);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      listingId: result.listing!.id,
      message: "Listing submitted for council review",
      source: "simulation",
    });
  }

  try {
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadArtifact } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromStringUnsafe(actor.address);
    const gov = await Contract.at(
      AztecAddress.fromStringUnsafe(govAddr),
      await loadArtifact("governance-Governance.json"),
      actor.wallet
    );

    const receipt = await gov.methods
      .submit_listing(BigInt(askEur), BigInt(marketRentRefEur), BigInt(dossierHash))
      .send({ from });
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      const mapped = humanizeContractError(outcome.error ?? "");
      if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
      return NextResponse.json(
        { error: `Listing submission was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    // The new listing is the last id: read the fresh count for the response.
    const count = toNum(
      simResult(await gov.methods.get_listing_count().simulate({ from })),
      "Governance.get_listing_count()"
    );

    return NextResponse.json({
      success: true,
      listingId: count - 1,
      message: "Listing submitted for council review",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[property/listings POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
