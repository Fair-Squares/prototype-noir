"use client";

import { PROPOSAL_STATUS, formatEUR, type Proposal } from "@/lib/contracts";

interface ProposalCardProps {
  proposal: Proposal;
  onVote?: (proposalId: number, voteYes: boolean) => Promise<void>;
  isVoting?: boolean;
}

export default function ProposalCard({ proposal, onVote, isVoting }: ProposalCardProps) {
  const totalVotes = proposal.yesVotes + proposal.noVotes;
  const yesPercent = totalVotes > 0 ? Math.round((proposal.yesVotes / totalVotes) * 100) : 0;
  const isActive = proposal.status === 0;
  const deadline = new Date(proposal.deadline * 1000);
  const isExpired = deadline < new Date();
  const statusLabel = PROPOSAL_STATUS[proposal.status] ?? "Unknown";

  const statusStyles: Record<number, string> = {
    0: "text-fs-teal bg-fs-teal/10 border-fs-teal/20",
    1: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    2: "text-fs-magenta-light bg-fs-magenta/10 border-fs-magenta/20",
    3: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };

  return (
    <div className="rounded-2xl bg-surface-card border border-surface-border p-5 card-hover">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 mr-3">
          <h3 className="font-semibold text-text-primary">{proposal.title || `Proposal #${proposal.id}`}</h3>
          {proposal.description && (
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">{proposal.description}</p>
          )}
          <p className="text-sm text-text-muted mt-1">
            Requesting <span className="font-semibold text-text-primary">{formatEUR(proposal.amount)}</span>
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
            statusStyles[proposal.status] ?? "text-text-muted bg-surface-raised border-surface-border"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Vote bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs font-medium mb-2">
          <span className="text-fs-teal">Yes: {proposal.yesVotes}</span>
          <span className="text-fs-magenta-light">No: {proposal.noVotes}</span>
        </div>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
          {totalVotes > 0 && (
            <div
              className="h-full bg-gradient-to-r from-fs-teal to-fs-teal-light rounded-full transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
          )}
        </div>
        {totalVotes > 0 && (
          <p className="text-xs text-text-muted mt-1.5 text-right">{yesPercent}% approval</p>
        )}
      </div>

      {/* Deadline */}
      <p className="text-xs text-text-muted mb-4">
        {isActive && !isExpired
          ? `Voting ends: ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`
          : isExpired && isActive
            ? "Voting ended -- ready to finalize"
            : `Ended: ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`}
      </p>

      {/* Vote buttons */}
      {isActive && !isExpired && onVote && (
        <div className="flex gap-2">
          <button
            onClick={() => onVote(proposal.id, true)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-xl bg-fs-teal/10 border border-fs-teal/20 text-fs-teal text-sm font-semibold hover:bg-fs-teal/15 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "Proving..." : "Vote Yes"}
          </button>
          <button
            onClick={() => onVote(proposal.id, false)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-xl bg-fs-magenta/10 border border-fs-magenta/20 text-fs-magenta-light text-sm font-semibold hover:bg-fs-magenta/15 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "Proving..." : "Vote No"}
          </button>
        </div>
      )}

      {isActive && !isExpired && (
        <p className="text-xs text-text-muted mt-3 text-center flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Your vote is private
        </p>
      )}
    </div>
  );
}
