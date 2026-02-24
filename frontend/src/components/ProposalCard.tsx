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
    0: "text-fs-teal bg-fs-mint",
    1: "text-blue-600 bg-blue-50",
    2: "text-fs-magenta bg-pink-50",
    3: "text-purple-600 bg-purple-50",
  };

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 mr-3">
          <h3 className="font-semibold text-fs-anthracite">
            {proposal.title || `Proposal #${proposal.id}`}
          </h3>
          {proposal.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{proposal.description}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            Budget: <span className="font-semibold text-fs-anthracite">{formatEUR(proposal.amount)}</span>
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
            statusStyles[proposal.status] ?? "text-gray-500 bg-gray-50"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Vote bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-fs-teal">Yes: {proposal.yesVotes}</span>
          <span className="text-fs-magenta">No: {proposal.noVotes}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          {totalVotes > 0 && (
            <div
              className="h-full bg-fs-teal rounded-full transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
          )}
        </div>
        {totalVotes > 0 && (
          <p className="text-xs text-gray-400 mt-1 text-right">{yesPercent}% in favour</p>
        )}
      </div>

      {/* Deadline */}
      <p className="text-xs text-gray-400 mb-4">
        {isActive && !isExpired
          ? `Voting closes ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`
          : isExpired && isActive
            ? "Voting closed -- ready to finalise"
            : `Closed ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`}
      </p>

      {/* Vote buttons */}
      {isActive && !isExpired && onVote && (
        <div className="flex gap-2">
          <button
            onClick={() => onVote(proposal.id, true)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-lg bg-fs-mint text-fs-teal-dark text-sm font-semibold hover:bg-fs-teal/15 disabled:opacity-40"
          >
            {isVoting ? "Submitting..." : "Vote Yes"}
          </button>
          <button
            onClick={() => onVote(proposal.id, false)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-lg bg-pink-50 text-fs-magenta text-sm font-semibold hover:bg-pink-100 disabled:opacity-40"
          >
            {isVoting ? "Submitting..." : "Vote No"}
          </button>
        </div>
      )}

      {isActive && !isExpired && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Your vote is anonymous
        </p>
      )}
    </div>
  );
}
