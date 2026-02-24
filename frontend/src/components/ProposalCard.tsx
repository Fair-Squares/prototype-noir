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
    0: "text-emerald-700 bg-emerald-50 border-emerald-200",
    1: "text-sky-700 bg-sky-50 border-sky-200",
    2: "text-red-600 bg-red-50 border-red-200",
    3: "text-purple-700 bg-purple-50 border-purple-200",
  };

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 mr-3">
          <h3 className="font-semibold text-gray-900">{proposal.title || `Proposal #${proposal.id}`}</h3>
          {proposal.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{proposal.description}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            Requesting <span className="font-semibold text-gray-700">{formatEUR(proposal.amount)}</span>
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
            statusStyles[proposal.status] ?? "text-gray-500 bg-gray-50"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Vote bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-medium">
          <span className="text-emerald-600">Yes: {proposal.yesVotes}</span>
          <span className="text-red-500">No: {proposal.noVotes}</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          {totalVotes > 0 && (
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
          )}
        </div>
        {totalVotes > 0 && (
          <p className="text-xs text-gray-400 mt-1 text-right">{yesPercent}% approval</p>
        )}
      </div>

      {/* Deadline */}
      <p className="text-xs text-gray-400 mb-4">
        {isActive && !isExpired
          ? `🗓 Voting ends: ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`
          : isExpired && isActive
            ? "⏰ Voting ended — ready to finalize"
            : `Ended: ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`}
      </p>

      {/* Vote buttons */}
      {isActive && !isExpired && onVote && (
        <div className="flex gap-2">
          <button
            onClick={() => onVote(proposal.id, true)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            {isVoting ? "⏳ Proving…" : "✓ Vote Yes"}
          </button>
          <button
            onClick={() => onVote(proposal.id, false)}
            disabled={isVoting}
            className="flex-1 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {isVoting ? "⏳ Proving…" : "✗ Vote No"}
          </button>
        </div>
      )}

      {/* Privacy note */}
      {isActive && !isExpired && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          🔒 Your vote is private — nobody can see which way you voted
        </p>
      )}
    </div>
  );
}
