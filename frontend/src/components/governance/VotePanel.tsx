"use client";

import { Alert, Button } from "@/components/ui";
import type { Proposal } from "@/lib/contracts";

export interface VotePanelProps {
  proposal: Proposal;
  isConnected: boolean;
  canVote: boolean;
  hasVoted: boolean;
  isVoting: boolean;
  eligibilityReason?: string;
  /** Deadline block has passed (on-chain status may still read ACTIVE). */
  windowClosed?: boolean;
  /** Wraps the real castVote call. */
  onVote: (voteYes: boolean) => void;
}

/**
 * Private-ballot voting control. Each account votes once; the ballot is secret,
 * so the UI tracks "already voted" locally. Only renders the Yes/No buttons
 * when the proposal is active and the account is cleared.
 */
export function VotePanel({
  proposal,
  isConnected,
  canVote,
  hasVoted,
  isVoting,
  eligibilityReason,
  windowClosed = false,
  onVote,
}: VotePanelProps) {
  if (proposal.status !== 0) {
    return (
      <p className="text-caption">
        Voting is closed for this proposal.
      </p>
    );
  }

  if (!isConnected) {
    return <p className="text-caption">Connect your wallet to cast a ballot.</p>;
  }

  if (hasVoted) {
    return (
      <Alert tone="success" title="Ballot recorded">
        You have already voted on this proposal. Each account votes once, and your
        ballot stays private.
      </Alert>
    );
  }

  if (windowClosed) {
    return (
      <p className="text-caption">
        The voting window has closed (the deadline block has passed), so no more ballots
        can be cast. This proposal now needs finalising.
      </p>
    );
  }

  if (!canVote) {
    return (
      <p className="text-caption">
        {eligibilityReason ?? "You are not cleared to vote yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption">
        Your ballot is private — the contract records that you voted, never how.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => onVote(true)} loading={isVoting} disabled={isVoting}>
          {isVoting ? "Recording…" : "Vote in favour"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onVote(false)}
          loading={isVoting}
          disabled={isVoting}
        >
          {isVoting ? "Recording…" : "Vote against"}
        </Button>
      </div>
    </div>
  );
}
