import type { StatusKind } from "@/components/ui";
import type { Proposal } from "@/lib/contracts";
import {
  AZTEC_SLOT_DURATION_SEC,
  BLOCK_PRODUCTION_MODE,
  blocksToSeconds,
  formatDuration,
} from "@/lib/chainParams";

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
  /** Human estimate of time left, e.g. "12m" — only meaningful while open. */
  remainingLabel: string;
  /** True locally where blocks are sealed on demand, not on wall-clock. */
  onDemand: boolean;
}

export function votingWindowFor(proposal: Proposal): VotingWindow {
  const deadlineBlock = proposal.deadlineBlock ?? proposal.deadline;
  const currentBlock = proposal.currentBlock ?? 0;
  const blocksRemaining = Math.max(0, deadlineBlock - currentBlock);
  const closed = blocksRemaining === 0;
  return {
    deadlineBlock,
    currentBlock,
    blocksRemaining,
    closed,
    remainingLabel: closed
      ? "Closed"
      : `${formatDuration(blocksToSeconds(blocksRemaining))} left`,
    onDemand: BLOCK_PRODUCTION_MODE === "on-demand",
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
