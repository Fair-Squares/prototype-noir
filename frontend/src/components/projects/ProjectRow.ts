import type { Proposal, PropertyDeed } from "@/lib/contracts";

/**
 * A housing "project" is the on-chain join of a governance proposal with its
 * property deed (when acquired) and the fund's per-proposal distribution state.
 * Proposal titles are not on-chain, so projects are labelled "Housing proposal #id".
 */
export interface ProjectRow {
  id: number;
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
        claimableAmount: p.claimableAmount ?? null,
        hasClaimed: p.hasClaimed ?? null,
      };
    })
    .sort((a, b) => b.id - a.id);
}
