import type { StatusKind } from "@/components/ui";
import type { Proposal } from "@/lib/contracts";
import { AZTEC_SLOT_DURATION_SEC, BLOCK_PRODUCTION_MODE } from "@/lib/chainParams";

// Maps the on-chain proposal status enum integer to a StatusChip kind. No
// invented states — only the four the Governance contract reports. The integers
// (0/1/2/3) carry NO user-facing label here; they are resolved to the canonical
// vocabulary ("Voting open"/"Approved"/"Rejected"/"Funded") via GOVERNANCE_LABEL
// and displayStatus() below, which is the source of truth for proposal labels.
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
  /** Whether the deadline is denominated in blocks (live mode) or unix seconds
   * (simulation mode). Drives which labels/units the UI may render. */
  kind: "block" | "timestamp";
  deadlineBlock: number;
  currentBlock: number;
  /** Remaining window: blocks for kind "block", SECONDS for kind "timestamp". */
  blocksRemaining: number;
  closed: boolean;
  /** Unit-correct remaining label, e.g. "5 blocks" or "4m 30s". Locally blocks
   * advance with activity (a few seconds each), so the block label is more
   * honest than a wall-clock estimate. Only meaningful while open. */
  remainingLabel: string;
  /** Unit-correct "closes at" label, e.g. "block 1,234" or "14:05". Use this in
   * copy instead of deadlineBlock — for timestamp deadlines the raw number is a
   * unix time and must never be rendered as a block height. */
  closesAtLabel: string;
  /** True locally where blocks advance with activity, not on a wall-clock cadence. */
  onDemand: boolean;
  /** True when the current block height is unknown (not supplied by the caller),
   * so blocksRemaining/closed cannot be computed. */
  unknown: boolean;
}

function formatRemainingSeconds(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

function formatWallClockDeadline(deadlineSec: number): string {
  const deadline = new Date(deadlineSec * 1000);
  const now = new Date();
  const sameDay =
    deadline.getFullYear() === now.getFullYear() &&
    deadline.getMonth() === now.getMonth() &&
    deadline.getDate() === now.getDate();
  const time = deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? time
    : `${deadline.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export function votingWindowFor(proposal: Proposal): VotingWindow {
  // Simulation proposals carry a wall-clock deadline (unix seconds) and no
  // current block. Without this branch they'd read as "unknown" forever — the
  // window would never close in the UI (no "Voting ended", no Finalise action)
  // and the unix timestamp would render as a block height.
  if (proposal.deadlineKind === "timestamp") {
    const deadlineSec = proposal.deadline;
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, deadlineSec - nowSec);
    const closed = secondsRemaining === 0;
    return {
      kind: "timestamp",
      deadlineBlock: deadlineSec,
      currentBlock: nowSec,
      blocksRemaining: secondsRemaining,
      closed,
      remainingLabel: closed ? "Closed" : formatRemainingSeconds(secondsRemaining),
      closesAtLabel: formatWallClockDeadline(deadlineSec),
      onDemand: false,
      unknown: false,
    };
  }

  const deadlineBlock = proposal.deadlineBlock ?? proposal.deadline;
  // currentBlock may be absent (e.g. the on-chain height wasn't fetched). Don't
  // silently assume block 0 — that would render an arbitrary, wrong countdown.
  // Surface an explicit "unknown" state instead.
  const unknown = proposal.currentBlock == null;
  const currentBlock = proposal.currentBlock ?? 0;
  const blocksRemaining = Math.max(0, deadlineBlock - currentBlock);
  const closed = !unknown && blocksRemaining === 0;
  return {
    kind: "block",
    deadlineBlock,
    currentBlock,
    blocksRemaining,
    closed,
    remainingLabel: unknown
      ? "Unknown"
      : closed
        ? "Closed"
        : `${blocksRemaining.toLocaleString()} block${blocksRemaining === 1 ? "" : "s"}`,
    closesAtLabel: `block ${deadlineBlock.toLocaleString()}`,
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

/** Plain-language meaning of a funding request's capital ask, for its current
 *  lifecycle state. Never says "if approved" for a home that is already funded,
 *  acquired, or whose proposal was rejected. Shared by the Projects board and the
 *  Governance memo so the same request reads identically in both places. */
export function fundingCaption(p: {
  status: number;
  distributionOpened?: boolean;
  hasDeed?: boolean;
}): string {
  if (p.status === 2) return "Requested capital — this proposal was rejected.";
  if (p.status === 3 || p.distributionOpened || p.hasDeed)
    return "Capital the fund committed to acquire this home.";
  if (p.status === 1)
    return "Approved — capital is committed when the acquisition executes.";
  return "Capital the fund commits to acquire this home if the community approves.";
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
