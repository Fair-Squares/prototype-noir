import type { Listing, Proposal, PropertyDeed } from "@/lib/contracts";

/**
 * A housing "project" is the on-chain join of a governance proposal (the funding
 * request) with its property deed (minted when the fund acquires the asset) and
 * the per-proposal distribution state.
 *
 * Titles, locations and unit counts are NOT recorded on-chain, so a project is
 * labelled "Housing proposal #id" and we surface only fields the contracts
 * actually return. Covenant terms (rent ceiling, lock) ARE on-chain since W1,
 * and the market-rent reference comes from the backing listing (J1/J3). The
 * full `Proposal` is carried through so the row can reuse the canonical
 * governance lifecycle helpers (displayStatus, votingWindowFor, quorumFor)
 * rather than re-deriving them.
 */
export interface ProjectRow {
  id: number;
  /** The source proposal — kept so governanceStatus helpers can read it. */
  proposal: Proposal;
  /** Requested capital from the proposal (€). */
  requestedAmount: number;
  /** Raw proposal status (0 active, 1 passed, 2 failed, 3 executed). */
  status: number;
  yesVotes: number;
  noVotes: number;
  /** Deed NFT exists for this proposal (asset acquired by the fund). */
  hasDeed: boolean;
  deedTokenId: number | null;
  /** On-chain deed valuation (€) — equals the opened distribution amount. */
  valuationEur: number | null;
  /** Distribution (Fund Shares pool) state from the proposal. */
  distributionOpened: boolean;
  distributionAmount: number | null;
  distributionClaimed: number | null;
  /** Deposits snapshotted when the distribution opened (pro-rata basis). */
  distributionSnapshotDeposits: number | null;
  /** Address-scoped eligibility for the connected wallet. */
  claimableAmount: number | null;
  hasClaimed: boolean | null;
  /** J6: on-chain covenant terms (W1/J3), when a covenant is attached.
   *  cappedMonthlyRentEur uses the same floor math record_rent enforces. */
  cappedMonthlyRentEur: number | null;
  /** Appraiser-attested monthly market rent from the backing listing. */
  marketRentRefEur: number | null;
  /** Whole-percent discount vs the market reference (needs both figures). */
  rentDiscountPct: number | null;
  lockYears: number | null;
}

/** Join proposals with deeds (and, when given, their backing listings for the
 *  covenant/market-rent columns) into project rows. Newest project first. */
export function buildProjectRows(
  proposals: Proposal[],
  deeds: PropertyDeed[],
  listings: Listing[] = []
): ProjectRow[] {
  const deedByProposal = new Map<number, PropertyDeed>();
  for (const deed of deeds) deedByProposal.set(deed.proposalId, deed);
  const listingByProposal = new Map<number, Listing>();
  for (const listing of listings) {
    if (listing.proposalId !== null) listingByProposal.set(listing.proposalId, listing);
  }

  return proposals
    .map((p): ProjectRow => {
      const deed = deedByProposal.get(p.id) ?? null;
      const listing = listingByProposal.get(p.id) ?? null;
      const cappedMonthlyRentEur =
        p.covenant?.isSet === true
          ? Math.floor(Math.floor((p.amount * p.covenant.rentCeilingBps) / 10000) / 12)
          : null;
      const marketRentRefEur = listing ? listing.marketRentRefEur : null;
      const rentDiscountPct =
        cappedMonthlyRentEur !== null && marketRentRefEur !== null && marketRentRefEur > 0
          ? Math.floor(((marketRentRefEur - cappedMonthlyRentEur) / marketRentRefEur) * 100)
          : null;
      return {
        id: p.id,
        proposal: p,
        requestedAmount: p.amount,
        status: p.status,
        yesVotes: p.yesVotes,
        noVotes: p.noVotes,
        hasDeed: deed !== null,
        deedTokenId: deed ? deed.tokenId : null,
        valuationEur: deed ? deed.valuationEur : null,
        distributionOpened: p.distributionOpened ?? false,
        distributionAmount: p.distributionAmount ?? null,
        distributionClaimed: p.distributionClaimed ?? null,
        distributionSnapshotDeposits: p.distributionSnapshotDeposits ?? null,
        claimableAmount: p.claimableAmount ?? null,
        hasClaimed: p.hasClaimed ?? null,
        cappedMonthlyRentEur,
        marketRentRefEur,
        rentDiscountPct,
        lockYears: p.covenant?.isSet === true ? p.covenant.lockYears : null,
      };
    })
    .sort((a, b) => b.id - a.id);
}

/**
 * Fraction of an opened distribution pool that has been claimed back by
 * depositors (0..1). Returns null when no distribution is open.
 */
export function distributionClaimedFraction(row: ProjectRow): number | null {
  if (!row.distributionOpened) return null;
  const amount = row.distributionAmount ?? 0;
  if (amount <= 0) return null;
  const claimed = row.distributionClaimed ?? 0;
  return Math.min(1, Math.max(0, claimed / amount));
}
