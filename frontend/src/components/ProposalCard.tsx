"use client";

import Link from "next/link";
import { PROPOSAL_STATUS, formatEUR, type Proposal } from "@/lib/contracts";
import {
  AZTEC_SLOT_DURATION_SEC,
  BLOCK_PRODUCTION_MODE,
  blocksToSeconds,
  formatDuration,
} from "@/lib/chainParams";

interface ProposalCardProps {
  proposal: Proposal;
  mode?: "compact" | "detail";
  canVote?: boolean;
  isConnected?: boolean;
  isVoting?: boolean;
  hasVoted?: boolean;
  onVote?: (proposalId: number, voteYes: boolean) => Promise<void>;
  actionHref?: string;
}

function statusClass(status: number): string {
  if (status === 0) return "bg-fs-mint text-fs-teal-dark";
  if (status === 1) return "bg-blue-50 text-blue-700";
  if (status === 2) return "bg-pink-50 text-fs-magenta";
  if (status === 3) return "bg-purple-50 text-purple-700";
  return "bg-bg text-text-3";
}

export default function ProposalCard({
  proposal,
  mode = "compact",
  canVote = false,
  isConnected = false,
  isVoting = false,
  hasVoted = false,
  onVote,
  actionHref,
}: ProposalCardProps) {
  const statusLabel = PROPOSAL_STATUS[proposal.status] ?? "Unknown";
  const isActive = proposal.status === 0;

  const deadlineBlock = proposal.deadlineBlock ?? proposal.deadline;
  const currentBlock = proposal.currentBlock ?? 0;
  const blocksRemaining = Math.max(0, deadlineBlock - currentBlock);
  const quorum = proposal.quorumRequired ?? 0;
  const totalVotes = proposal.totalVotes ?? proposal.yesVotes + proposal.noVotes;
  const quorumReached = proposal.quorumReached ?? totalVotes >= quorum;
  const majorityYes = proposal.yesVotes > proposal.noVotes;
  const wouldPass = quorumReached && majorityYes;

  if (mode === "compact") {
    return (
      <article className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-text-1">{proposal.title || `Proposal #${proposal.id}`}</h3>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(proposal.status)}`}>
            {statusLabel}
          </span>
        </div>

        <p className="mt-2 text-sm text-text-2">Budget: {formatEUR(proposal.amount)}</p>

        {actionHref && (
          <Link
            href={actionHref}
            className="mt-3 inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
          >
            Open
          </Link>
        )}
      </article>
    );
  }

  return (
    <article className="surface p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-semibold text-text-1">{proposal.title || `Proposal #${proposal.id}`}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(proposal.status)}`}>
          {statusLabel}
        </span>
      </div>

      {proposal.description && <p className="mt-2 text-sm text-text-2">{proposal.description}</p>}

      <p className="mt-4 text-sm text-text-2">
        Budget: <strong className="text-text-1">{formatEUR(proposal.amount)}</strong>
      </p>

      <p className="mt-2 text-sm text-text-2">
        Votes: <strong className="text-fs-teal">{proposal.yesVotes}</strong> yes · <strong className="text-fs-magenta">{proposal.noVotes}</strong> no
      </p>

      {/* What it takes to pass / fail */}
      <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-text-3">What it takes to pass</p>
        <p className="mt-1 text-text-2">
          At least <strong className="text-text-1">{quorum}</strong> total votes (quorum) and more{" "}
          <span className="text-fs-teal">Yes</span> than <span className="text-fs-magenta">No</span>.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-text-2">
          <li>
            Quorum: {totalVotes}/{quorum}{" "}
            <span className={quorumReached ? "font-semibold text-fs-teal-dark" : "text-text-3"}>
              {quorumReached ? "· met" : "· not met"}
            </span>
          </li>
          <li>
            Majority: {proposal.yesVotes} Yes vs {proposal.noVotes} No{" "}
            <span className={majorityYes ? "font-semibold text-fs-teal-dark" : "text-text-3"}>
              {majorityYes
                ? "· Yes leads"
                : proposal.yesVotes === proposal.noVotes
                ? "· tied"
                : "· No leads"}
            </span>
          </li>
          <li className="pt-1 font-semibold text-text-1">
            {isActive
              ? wouldPass
                ? "On track to pass if the window closed now."
                : "Would not pass yet — needs more Yes votes and/or quorum."
              : `Final result: ${statusLabel}.`}
          </li>
        </ul>
      </div>

      {/* Voting window / time remaining */}
      {isActive && (
        <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-text-3">Voting window</p>
          <p className="mt-1 text-text-2">
            Closes at block <strong className="text-text-1">{deadlineBlock}</strong> ·{" "}
            <strong className="text-text-1">{blocksRemaining}</strong> block
            {blocksRemaining === 1 ? "" : "s"} remaining
            {blocksRemaining > 0 && (
              <> (~{formatDuration(blocksToSeconds(blocksRemaining))} at {AZTEC_SLOT_DURATION_SEC}s/block)</>
            )}
          </p>
          {blocksRemaining === 0 ? (
            <p className="mt-1 text-xs text-text-3">Window reached — the proposal can now be finalized.</p>
          ) : (
            BLOCK_PRODUCTION_MODE === "on-demand" && (
              <p className="mt-1 text-xs text-text-3">
                Locally, blocks are produced on-demand (only when transactions happen), so the time is a
                steady-state estimate — the window advances as activity occurs.
              </p>
            )
          )}
        </div>
      )}

      {isActive && onVote && (
        <div className="mt-4">
          {!isConnected ? (
            <p className="text-sm text-text-3">Connect your wallet to vote.</p>
          ) : hasVoted ? (
            <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/10 p-3 text-sm text-fs-teal-dark">
              ✓ You have already voted on this proposal. Each account votes once; your ballot stays private.
            </div>
          ) : !canVote ? (
            <p className="text-sm text-text-3">You are not ready to vote yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onVote(proposal.id, true)}
                disabled={isVoting}
                className="rounded-lg bg-fs-mint px-3 py-2 text-sm font-semibold text-fs-teal-dark hover:bg-fs-teal/15 disabled:opacity-50"
              >
                {isVoting ? "Working..." : "Vote Yes"}
              </button>
              <button
                onClick={() => onVote(proposal.id, false)}
                disabled={isVoting}
                className="rounded-lg bg-pink-50 px-3 py-2 text-sm font-semibold text-fs-magenta hover:bg-pink-100 disabled:opacity-50"
              >
                {isVoting ? "Working..." : "Vote No"}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
