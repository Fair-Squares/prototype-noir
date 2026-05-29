import type { Proposal, PropertyDeed } from "@/lib/contracts";

/**
 * A housing "project" is the on-chain join of a governance proposal (the funding
 * request) with its property deed (minted when the fund acquires the asset) and
 * the per-proposal distribution state.
 *
 * Titles, locations, unit counts and covenant terms are NOT recorded on-chain,
 * so a project is labelled "Housing proposal #id" and we surface only fields the
 * contracts actually return. The full `Proposal` is carried through so the row
 * can reuse the canonical governance lifecycle helpers (displayStatus,
 * votingWindowFor, quorumFor) rather than re-deriving them.
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
}

/** Join proposals with deeds into project rows. Newest project first. */
export function buildProjectRows(
  proposals: Proposal[],
  deeds: PropertyDeed[]
): ProjectRow[] {
  const deedByProposal = new Map<number, PropertyDeed>();
  for (const deed of deeds) deedByProposal.set(deed.proposalId, deed);

  return proposals
    .map((p): ProjectRow => {
      const deed = deedByProposal.get(p.id) ?? null;
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
