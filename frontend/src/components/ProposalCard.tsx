"use client";

import type { KeyboardEvent } from "react";
import { PROPOSAL_STATUS, formatEUR, type Proposal } from "@/lib/contracts";

interface ProposalCardProps {
  proposal: Proposal;
  onVote?: (proposalId: number, voteYes: boolean) => Promise<void>;
  onFinalize?: (proposalId: number) => Promise<void>;
  onExecute?: (proposalId: number, amount: number) => Promise<void>;
  onClaim?: (proposalId: number) => Promise<void>;
  isVoting?: boolean;
  userAddress?: string | null;
  isInvestor?: boolean;
  showActions?: boolean;
  onOpen?: () => void;
}

export default function ProposalCard({
  proposal,
  onVote,
  onFinalize,
  onExecute,
  onClaim,
  isVoting,
  userAddress,
  isInvestor = true,
  showActions = true,
  onOpen,
}: ProposalCardProps) {
  const totalVotes = proposal.yesVotes + proposal.noVotes;
  const quorumRequired = proposal.quorumRequired ?? 2;
  const quorumProgress = quorumRequired > 0 ? Math.min(100, Math.round((totalVotes / quorumRequired) * 100)) : 0;
  const quorumReached = totalVotes >= quorumRequired;
  const yesPercent = totalVotes > 0 ? Math.round((proposal.yesVotes / totalVotes) * 100) : 0;
  const isActive = proposal.status === 0;
  const isPassed = proposal.status === 1;
  const isExecuted = proposal.status === 3;
  const distributionOpened = Boolean(proposal.distributionOpened);
  const hasClaimed = Boolean(proposal.hasClaimed);
  const claimableAmount = proposal.claimableAmount ?? 0;
  const hasBlockTiming = proposal.currentBlock !== undefined || proposal.deadlineBlock !== undefined;
  const currentBlock = proposal.currentBlock ?? 0;
  const deadlineBlock = proposal.deadlineBlock ?? proposal.deadline ?? 0;
  const blocksLeft = Math.max(0, deadlineBlock - currentBlock);
  const unixDeadline = new Date((proposal.deadline ?? 0) * 1000);
  const minsLeft = Math.max(0, Math.ceil(((proposal.deadline ?? 0) * 1000 - Date.now()) / 60000));
  const isExpired = hasBlockTiming ? (deadlineBlock > 0 ? currentBlock >= deadlineBlock : false) : unixDeadline < new Date();
  const statusLabel = PROPOSAL_STATUS[proposal.status] ?? "Unknown";

  const statusColor: Record<number, string> = {
    0: "text-fs-teal bg-fs-mint",
    1: "text-blue-600 bg-blue-50",
    2: "text-fs-magenta bg-pink-50",
    3: "text-purple-600 bg-purple-50",
  };

  const canVote = !!userAddress && isInvestor;
  const canFinalize = showActions && isActive && isExpired && quorumReached && !!onFinalize && !!userAddress;
  const canExecute = showActions && isPassed && !!onExecute && !!userAddress;
  const canClaim = showActions && isExecuted && distributionOpened && !hasClaimed && claimableAmount > 0 && !!onClaim && !!userAddress;

  const step = isExecuted ? 3 : isPassed ? 2 : isActive ? 1 : 2;
  const isInteractive = typeof onOpen === "function";
  const handleKeyOpen = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className={`rounded-xl bg-card border p-5 ${isExecuted ? "ring-1 ring-purple-200" : ""} ${
        isInteractive
          ? "cursor-pointer border-border hover:border-fs-teal/40 transition-colors"
          : "border-border"
      }`}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onOpen : undefined}
      onKeyDown={handleKeyOpen}
    >
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{proposal.title || `Proposal #${proposal.id}`}</h3>
          {proposal.description && (
            <p className="text-sm text-text-2 mt-1 line-clamp-2">{proposal.description}</p>
          )}
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
            statusColor[proposal.status] ?? "text-text-3 bg-bg"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="rounded-lg bg-bg border border-border p-3 mb-4">
        <p className="text-sm text-text-3">
          Budget:{" "}
          <span className="text-text-1 font-medium">{formatEUR(proposal.amount)}</span>
          <span className="ml-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full align-middle">
            EURs
          </span>
        </p>
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-3 gap-2 mb-1">
          <div className={`h-1.5 rounded-full ${step >= 1 ? "bg-fs-teal" : "bg-border"}`} />
          <div className={`h-1.5 rounded-full ${step >= 2 ? "bg-blue-500" : "bg-border"}`} />
          <div className={`h-1.5 rounded-full ${step >= 3 ? "bg-purple-500" : "bg-border"}`} />
        </div>
        <div className="flex justify-between text-[10px] text-text-3">
          <span>Active</span>
          <span>Finalized</span>
          <span>Executed</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-fs-teal">Yes: {proposal.yesVotes}</span>
          <span className="text-fs-magenta">No: {proposal.noVotes}</span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden border border-border/60">
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

      <div className="mb-4 rounded-lg bg-bg border border-border p-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-text-2 font-medium">Quorum</span>
          <span className={`font-semibold ${quorumReached ? "text-fs-teal" : "text-text-3"}`}>
            {totalVotes}/{quorumRequired}
          </span>
        </div>
        <div className="h-1.5 bg-white rounded-full overflow-hidden border border-border/60">
          <div
            className={`h-full rounded-full ${quorumReached ? "bg-fs-teal" : "bg-text-3/40"}`}
            style={{ width: `${quorumProgress}%` }}
          />
        </div>
        {!quorumReached && isActive && isExpired && (
          <p className="text-xs text-fs-magenta mt-2">Finalize blocked: minimum quorum is {quorumRequired} votes.</p>
        )}
      </div>

      <p className="text-xs text-text-3 mb-4">
        {hasBlockTiming && isActive && !isExpired
          ? `Voting closes at block ${deadlineBlock} (${blocksLeft} blocks left)`
          : hasBlockTiming && isActive && isExpired
          ? "Voting period ended — finalize to resolve"
          : hasBlockTiming
          ? `Closed at block ${deadlineBlock}`
          : isActive && !isExpired
          ? `Voting closes in ~${minsLeft} min`
          : isActive && isExpired
          ? "Voting period ended — finalize to resolve"
          : `Closed ${unixDeadline.toLocaleString("en-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      </p>

      {isExecuted && (
        <div className="mb-4 rounded-lg bg-purple-50 border border-purple-100 px-3 py-2 text-xs text-purple-700 font-medium">
          Proposal executed. Investors can now claim their FSFT share.
        </div>
      )}

      {showActions && isActive && !isExpired && onVote && canVote && (
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
      {showActions && isActive && isExpired && !quorumReached && !!userAddress && (
        <p className="text-xs text-text-3 text-center">Need at least {quorumRequired} total votes before finalization.</p>
      )}

      {canExecute && (
        <div className="space-y-2">
          <p className="text-xs text-text-3">
            Proposal passed. Execute it to open FSFT claims for investors.
          </p>
          <button
            onClick={() => onExecute!(proposal.id, proposal.amount)}
            disabled={isVoting}
            className="w-full py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            {isVoting ? "…" : "Execute & Open Distribution"}
          </button>
        </div>
      )}

      {showActions && isExecuted && distributionOpened && (
        <div className="space-y-2">
          <p className="text-xs text-text-3">
            Distribution claimed: {(proposal.distributionClaimed ?? 0).toLocaleString()} / {(proposal.distributionAmount ?? 0).toLocaleString()} FSFT
          </p>
          {hasClaimed && (
            <div className="w-full py-2 rounded-lg bg-fs-mint text-fs-teal-dark text-sm font-semibold text-center">
              Claimed
            </div>
          )}
          {!hasClaimed && canClaim && (
            <button
              onClick={() => onClaim!(proposal.id)}
              disabled={isVoting}
              className="w-full py-2 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark disabled:opacity-40 transition-colors"
            >
              {isVoting ? "…" : `Claim ${claimableAmount.toLocaleString()} FSFT`}
            </button>
          )}
          {!hasClaimed && !canClaim && !!userAddress && (
            <p className="text-xs text-text-3">No claimable amount for this account right now.</p>
          )}
        </div>
      )}

      {showActions && isActive && userAddress && !canVote && (
        <p className="text-xs text-text-3 text-center">Voting requires investor role plus fund exposure.</p>
      )}

      {showActions && isActive && !userAddress && !isExecuted && (
        <p className="text-xs text-text-3 text-center">Connect wallet to vote</p>
      )}

      {isInteractive && (
        <p className="text-[11px] text-text-3 mt-4">Click to open full proposal details</p>
      )}
    </div>
  );
}
