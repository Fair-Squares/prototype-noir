import Link from "next/link";
import { StatusChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import {
  displayStatus,
  proposalLabel,
  quorumFor,
  votingWindowFor,
} from "@/lib/proposalLifecycle";

export interface GovernanceMemoCardProps {
  proposal: Proposal;
  /** Whether the connected account is cleared to vote on active proposals. */
  canVote: boolean;
  /** Plain-language reason shown when the account cannot vote yet. */
  eligibilityReason?: string;
  /** True once a wallet is connected (gates the eligibility line). */
  isConnected: boolean;
}

/**
 * Investment-committee memo for one housing proposal. Reads as a deal-room
 * line item, not a DAO card: the funding ask and what it buys come first, then
 * the voting window and quorum maths, then status and the reader's own voting
 * standing. Token mechanics are deferred to the detail page.
 */
export function GovernanceMemoCard({
  proposal,
  canVote,
  eligibilityReason,
  isConnected,
}: GovernanceMemoCardProps) {
  const window = votingWindowFor(proposal);
  const quorum = quorumFor(proposal);
  const status = displayStatus(proposal);
  const isActive = proposal.status === 0;
  // Active on-chain but the deadline block has passed: voting is over.
  const votingOpen = isActive && !window.closed;
  const href = `/governance/${proposal.id}`;

  return (
    <article className="surface flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Funding request</p>
          <h3 className="text-heading mt-0.5 text-text-1">
            {proposalLabel(proposal)}
          </h3>
        </div>
        <StatusChip status={status.kind} label={status.label} />
      </header>

      <div>
        <p className="text-kpi-sm text-text-1">{formatEUR(proposal.amount)}</p>
        <p className="text-caption mt-1 text-text-2">
          Capital the fund would commit to acquire this home if the committee
          approves.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
        <div>
          <dt className="text-label">Quorum</dt>
          <dd className="text-body mt-0.5 text-mono text-text-1">
            {quorum.total.toLocaleString()} / {quorum.required.toLocaleString()}
          </dd>
          <dd className="text-caption mt-0.5">
            {quorum.reached ? "Quorum met" : "Quorum not yet met"}
          </dd>
        </div>
        <div>
          <dt className="text-label">Voting window</dt>
          <dd className="text-body mt-0.5 text-text-1">
            {isActive ? window.remainingLabel : "Closed"}
          </dd>
          <dd className="text-caption mt-0.5 text-mono">
            Closes at block {window.deadlineBlock.toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-caption min-w-0">
          {!isConnected
            ? "Connect a wallet to check your voting standing."
            : canVote
              ? votingOpen
                ? "You are cleared to vote on this proposal."
                : "Voting is closed for this proposal."
              : (eligibilityReason ?? "You are not cleared to vote yet.")}
        </p>
        <Link
          href={href}
          className="btn btn-secondary btn-sm flex-shrink-0"
          aria-label={`Open ${proposalLabel(proposal)}`}
        >
          {votingOpen && canVote ? "Review & vote" : "View memo"}
        </Link>
      </div>
    </article>
  );
}
