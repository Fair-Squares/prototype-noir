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

  const statusColor: Record<number, string> = {
    0: "text-fs-teal bg-fs-mint",
    1: "text-blue-600 bg-blue-50",
    2: "text-fs-magenta bg-pink-50",
    3: "text-purple-600 bg-purple-50",
  };

  return (
    <div className="rounded-xl bg-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 mr-3">
          <h3 className="font-semibold">{proposal.title || `Proposal #${proposal.id}`}</h3>
          {proposal.description && (
            <p className="text-sm text-text-2 mt-1 line-clamp-2">{proposal.description}</p>
          )}
          <p className="text-sm text-text-3 mt-1">
            Budget: <span className="text-text-1 font-medium">{formatEUR(proposal.amount)}</span>
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor[proposal.status] ?? "text-text-3 bg-bg"}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-fs-teal">Yes: {proposal.yesVotes}</span>
          <span className="text-fs-magenta">No: {proposal.noVotes}</span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden">
          {totalVotes > 0 && (
            <div className="h-full bg-fs-teal rounded-full" style={{ width: `${yesPercent}%` }} />
          )}
        </div>
        {totalVotes > 0 && <p className="text-xs text-text-3 mt-1 text-right">{yesPercent}% in favour</p>}
      </div>

      <p className="text-xs text-text-3 mb-4">
        {isActive && !isExpired
          ? `Voting closes ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`
          : isExpired && isActive ? "Voting closed" : `Closed ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`}
      </p>

      {isActive && !isExpired && onVote && (
        <div className="flex gap-2">
          <button onClick={() => onVote(proposal.id, true)} disabled={isVoting}
            className="flex-1 py-2 rounded-lg bg-fs-mint text-fs-teal-dark text-sm font-semibold hover:bg-fs-teal/15 disabled:opacity-40">
            {isVoting ? "..." : "Vote Yes"}
          </button>
          <button onClick={() => onVote(proposal.id, false)} disabled={isVoting}
            className="flex-1 py-2 rounded-lg bg-pink-50 text-fs-magenta text-sm font-semibold hover:bg-pink-100 disabled:opacity-40">
            {isVoting ? "..." : "Vote No"}
          </button>
        </div>
      )}
    </div>
  );
}
