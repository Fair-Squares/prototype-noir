"use client";

import { PROPOSAL_STATUS, formatEUR, type Proposal } from "@/lib/contracts";

interface ProposalCardProps {
  proposal: Proposal;
  onVote?: (proposalId: number, voteYes: boolean) => Promise<void>;
  onFinalize?: (proposalId: number) => Promise<void>;
  onExecute?: (proposalId: number, amount: number) => Promise<void>;
  isVoting?: boolean;
  userAddress?: string | null;
}

export default function ProposalCard({
  proposal,
  onVote,
  onFinalize,
  onExecute,
  isVoting,
  userAddress,
}: ProposalCardProps) {
  const totalVotes = proposal.yesVotes + proposal.noVotes;
  const yesPercent = totalVotes > 0 ? Math.round((proposal.yesVotes / totalVotes) * 100) : 0;
  const isActive = proposal.status === 0;
  const isPassed = proposal.status === 1;
  const isExecuted = proposal.status === 3;
  const deadline = new Date(proposal.deadline * 1000);
  const isExpired = deadline < new Date();
  const statusLabel = PROPOSAL_STATUS[proposal.status] ?? "Unknown";

  const statusColor: Record<number, string> = {
    0: "text-fs-teal bg-fs-mint",
    1: "text-blue-600 bg-blue-50",
    2: "text-fs-magenta bg-pink-50",
    3: "text-purple-600 bg-purple-50",
  };

  const canFinalize = isActive && (isExpired || totalVotes > 0) && !!onFinalize && !!userAddress;
  const canExecute = isPassed && !!onExecute && !!userAddress;

  return (
    <div className={`rounded-xl bg-card p-5 ${isExecuted ? "ring-1 ring-purple-200" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 mr-3">
          <h3 className="font-semibold">{proposal.title || `Proposal #${proposal.id}`}</h3>
          {proposal.description && (
            <p className="text-sm text-text-2 mt-1 line-clamp-2">{proposal.description}</p>
          )}
          <p className="text-sm text-text-3 mt-1">
            Budget:{" "}
            <span className="text-text-1 font-medium">{formatEUR(proposal.amount)}</span>
            <span className="ml-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full align-middle">
              EURs
            </span>
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            statusColor[proposal.status] ?? "text-text-3 bg-bg"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Vote tally */}
      <div className="mb-3">
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-fs-teal">Yes: {proposal.yesVotes}</span>
          <span className="text-fs-magenta">No: {proposal.noVotes}</span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden">
          {totalVotes > 0 && (
            <div
              className="h-full bg-fs-teal rounded-full transition-all"
              style={{ width: `${yesPercent}%` }}
            />
          )}
        </div>
        {totalVotes > 0 && (
          <p className="text-xs text-text-3 mt-1 text-right">{yesPercent}% in favour</p>
        )}
      </div>

      {/* Deadline */}
      <p className="text-xs text-text-3 mb-4">
        {isActive && !isExpired
          ? `Voting closes ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`
          : isActive && isExpired
          ? "Voting period ended — finalize to resolve"
          : `Closed ${deadline.toLocaleDateString("en-NL", { day: "numeric", month: "short", year: "numeric" })}`}
      </p>

      {/* FSFT minted badge */}
      {isExecuted && (
        <div className="mb-4 rounded-lg bg-purple-50 border border-purple-100 px-3 py-2 text-xs text-purple-700 font-medium">
          ✅ Asset acquired · {proposal.amount.toLocaleString()} FSFT minted to fund
        </div>
      )}

      {/* Action buttons */}
      {isActive && !isExpired && onVote && userAddress && (
        <div className="flex gap-2">
          <button
            onClick={() => onVote(proposal.id, true)}
            disabled={isVoting}
            className="flex-1 py-2 rounded-lg bg-fs-mint text-fs-teal-dark text-sm font-semibold hover:bg-fs-teal/15 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "…" : "Vote Yes"}
          </button>
          <button
            onClick={() => onVote(proposal.id, false)}
            disabled={isVoting}
            className="flex-1 py-2 rounded-lg bg-pink-50 text-fs-magenta text-sm font-semibold hover:bg-pink-100 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "…" : "Vote No"}
          </button>
        </div>
      )}

      {canFinalize && (
        <button
          onClick={() => onFinalize!(proposal.id)}
          disabled={isVoting}
          className="w-full py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-40 transition-colors"
        >
          {isVoting ? "…" : "Finalize Proposal"}
        </button>
      )}

      {canExecute && (
        <div className="space-y-2">
          <p className="text-xs text-text-3">
            Proposal passed — execute to acquire the asset and mint {proposal.amount.toLocaleString()} FSFT.
          </p>
          <button
            onClick={() => onExecute!(proposal.id, proposal.amount)}
            disabled={isVoting}
            className="w-full py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "…" : `Execute & Mint ${proposal.amount.toLocaleString()} FSFT`}
          </button>
        </div>
      )}

      {isActive && !userAddress && !isExecuted && (
        <p className="text-xs text-text-3 text-center">Connect wallet to vote</p>
      )}
    </div>
  );
}
