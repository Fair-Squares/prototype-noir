import type { FundingQueueEntry, Listing } from "@/lib/contracts";
import { votingWindowFor } from "@/lib/proposalLifecycle";
import type { ProjectRow } from "@/components/projects/ProjectRow";

/**
 * ONE lifecycle for the one object everyone
 * cares about — a home. A home is either still a listing (pre-proposal) or a
 * proposal-backed project; either way it renders as a single card whose stage
 * sits on one shared timeline:
 *
 *   council review → community vote → funding queue → owned
 *
 * with two rejected exits (by the council, or by the vote). This union kills
 * the four-names problem (listing / project / funding request / queue entry).
 */
export type HomeStage =
  | "review" // listing submitted, awaiting council
  | "ready" // council approved, vote not yet opened
  | "voting" // proposal open for voting
  | "voting_ended" // window closed, awaiting finalisation
  | "queued" // vote passed, waiting in the funding queue
  | "owned" // funded — the fund holds the home
  | "rejected_review" // council rejected the listing
  | "rejected_vote"; // the community voted it down

export interface HomeRow {
  key: string;
  stage: HomeStage;
  /** Present for pre-proposal stages (and carried alongside proposals). */
  listing: Listing | null;
  /** Present once a proposal backs the home. */
  project: ProjectRow | null;
  /** 1-based rank in the funding queue, for stage "queued" when known. */
  queueRank: number | null;
  /** Fundable right now (queue entry vs available capital), when known. */
  fundable: boolean | null;
}

function stageForProject(row: ProjectRow): HomeStage {
  if (row.status === 2) return "rejected_vote";
  if (row.status === 3 || row.distributionOpened || row.hasDeed) return "owned";
  if (row.status === 1) return "queued";
  return votingWindowFor(row.proposal).closed ? "voting_ended" : "voting";
}

/** Attention-first ordering: things a user can act on now come first. */
const STAGE_RANK: Record<HomeStage, number> = {
  voting: 0,
  voting_ended: 1,
  ready: 2,
  queued: 3,
  review: 4,
  owned: 5,
  rejected_review: 6,
  rejected_vote: 6,
};

export function buildHomeRows(
  listings: Listing[],
  projects: ProjectRow[],
  queue: FundingQueueEntry[]
): HomeRow[] {
  const rankByProposal = new Map<number, number>();
  const fundableByProposal = new Map<number, boolean>();
  queue.forEach((entry, i) => {
    rankByProposal.set(entry.proposalId, i + 1);
    fundableByProposal.set(entry.proposalId, entry.fundable);
  });

  const listingByProposal = new Map<number, Listing>();
  for (const listing of listings) {
    if (listing.proposalId !== null) listingByProposal.set(listing.proposalId, listing);
  }

  const rows: HomeRow[] = [];

  // Proposal-backed homes (their listing, when any, rides along).
  for (const project of projects) {
    rows.push({
      key: `proposal-${project.id}`,
      stage: stageForProject(project),
      listing: listingByProposal.get(project.id) ?? null,
      project,
      queueRank: rankByProposal.get(project.id) ?? null,
      fundable: fundableByProposal.get(project.id) ?? null,
    });
  }

  // Pre-proposal listings (status 3 = PROPOSED is already represented above).
  for (const listing of listings) {
    if (listing.proposalId !== null || listing.status === 3) continue;
    const stage: HomeStage =
      listing.status === 1 ? "review" : listing.status === 2 ? "ready" : "rejected_review";
    rows.push({
      key: `listing-${listing.id}`,
      stage,
      listing,
      project: null,
      queueRank: null,
      fundable: null,
    });
  }

  return rows.sort((a, b) => {
    const rank = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
    if (rank !== 0) return rank;
    const aId = a.project?.id ?? a.listing?.id ?? 0;
    const bId = b.project?.id ?? b.listing?.id ?? 0;
    return bId - aId;
  });
}
