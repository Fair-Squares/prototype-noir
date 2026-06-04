import type { StatusKind } from "@/components/ui";
import type { Proposal } from "@/lib/contracts";
import { AZTEC_SLOT_DURATION_SEC, BLOCK_PRODUCTION_MODE } from "@/lib/chainParams";

// Maps the on-chain proposal status enum (0=active, 1=passed, 2=failed,
// 3=executed) to a StatusChip kind. No invented states — only the four the
// Governance contract reports.
const STATUS_KIND: Record<number, StatusKind> = {
  0: "active",
  1: "passed",
  2: "failed",
  3: "executed",
};

export function statusKindFor(status: number): StatusKind {
  return STATUS_KIND[status] ?? "pending";
}

export interface VotingWindow {
  deadlineBlock: number;
  currentBlock: number;
  blocksRemaining: number;
  closed: boolean;
  /** Block-denominated label, e.g. "5 blocks". Locally blocks advance with
   * activity (a few seconds each), so this is more honest than a wall-clock
   * estimate. Only meaningful while open. */
  remainingLabel: string;
  /** True locally where blocks advance with activity, not on a wall-clock cadence. */
  onDemand: boolean;
  /** True when the current block height is unknown (not supplied by the caller),
   * so blocksRemaining/closed cannot be computed. */
  unknown: boolean;
}

export function votingWindowFor(proposal: Proposal): VotingWindow {
  const deadlineBlock = proposal.deadlineBlock ?? proposal.deadline;
  // currentBlock may be absent (e.g. the on-chain height wasn't fetched). Don't
  // silently assume block 0 — that would render an arbitrary, wrong countdown.
  // Surface an explicit "unknown" state instead.
  const unknown = proposal.currentBlock == null;
  const currentBlock = proposal.currentBlock ?? 0;
  const blocksRemaining = Math.max(0, deadlineBlock - currentBlock);
  const closed = !unknown && blocksRemaining === 0;
  return {
    deadlineBlock,
    currentBlock,
    blocksRemaining,
    closed,
    remainingLabel: unknown
      ? "Unknown"
      : closed
        ? "Closed"
        : `${blocksRemaining.toLocaleString()} block${blocksRemaining === 1 ? "" : "s"}`,
    onDemand: BLOCK_PRODUCTION_MODE === "on-demand",
    unknown,
  };
}

// On-chain status is sticky: a proposal stays ACTIVE (0) until someone calls
// finalize_proposal, even after its voting-window block has passed. Surface that
// "voting ended, awaiting finalisation" state for display so the chip doesn't
// keep reading "Active" after the deadline block.
export function isVotingEnded(proposal: Proposal): boolean {
  return proposal.status === 0 && votingWindowFor(proposal).closed;
}

// CANONICAL governance lifecycle vocabulary — reused everywhere (CLAUDE.md
// "User-facing product rules"). Never the raw on-chain enum words
// (Active/Passed/Failed/Executed): a first-time user reads these.
//   Voting open → Voting ended → Approved → Rejected → Funded
const GOVERNANCE_LABEL: Record<number, string> = {
  0: "Voting open",
  1: "Approved",
  2: "Rejected",
  3: "Funded",
};

/** Canonical {kind, label} for a proposal. `label` is ALWAYS set so callers
 *  never fall back to a divergent default (e.g. "Executed" instead of "Funded"). */
export function displayStatus(proposal: Proposal): { kind: StatusKind; label: string } {
  if (isVotingEnded(proposal)) return { kind: "pending", label: "Voting ended" };
  return {
    kind: statusKindFor(proposal.status),
    label: GOVERNANCE_LABEL[proposal.status] ?? "Pending",
  };
}

export interface Quorum {
  required: number;
  total: number;
  reached: boolean;
  yes: number;
  no: number;
  majorityYes: boolean;
}

export function quorumFor(proposal: Proposal): Quorum {
  const required = proposal.quorumRequired ?? 0;
  const total = proposal.totalVotes ?? proposal.yesVotes + proposal.noVotes;
  return {
    required,
    total,
    reached: proposal.quorumReached ?? total >= required,
    yes: proposal.yesVotes,
    no: proposal.noVotes,
    majorityYes: proposal.yesVotes > proposal.noVotes,
  };
}

/** "Housing proposal #N" — titles are not on-chain, so we never use them. */
export function proposalLabel(proposal: Proposal): string {
  return `Housing proposal #${proposal.id}`;
}

export const SLOT_SECONDS = AZTEC_SLOT_DURATION_SEC;
