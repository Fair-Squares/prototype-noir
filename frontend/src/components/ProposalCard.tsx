"use client";

import Link from "next/link";
import { PROPOSAL_STATUS, formatEUR, type Proposal } from "@/lib/contracts";

interface ProposalCardProps {
  proposal: Proposal;
  mode?: "compact" | "detail";
  canVote?: boolean;
  isConnected?: boolean;
  isVoting?: boolean;
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
  onVote,
  actionHref,
}: ProposalCardProps) {
  const statusLabel = PROPOSAL_STATUS[proposal.status] ?? "Unknown";
  const isActive = proposal.status === 0;

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
    <article className="rounded-2xl border border-border bg-card p-5">
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

      {isActive && onVote && (
        <div className="mt-4">
          {!isConnected ? (
            <p className="text-sm text-text-3">Connect your wallet to vote.</p>
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
