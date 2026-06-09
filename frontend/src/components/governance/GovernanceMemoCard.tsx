import Link from "next/link";
import { ModelledChip, StatusChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import {
  displayStatus,
  fundingCaption,
  proposalLabel,
  quorumFor,
  votingWindowFor,
} from "@/lib/proposalLifecycle";
import { getProjectDossier } from "@/lib/projectDossier";

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
  const govHref = `/governance/${proposal.id}`;
  const projectHref = `/fund/${proposal.id}`;

  // Lead with the project's human identity when a dossier is authored; the
  // governance board decides on a project, it doesn't duplicate its dossier.
  const dossier = getProjectDossier(proposal);
  const displayName = dossier?.name ?? proposalLabel(proposal);

  return (
    <article className="surface flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {dossier ? (
            <span className="text-label inline-flex items-center gap-2">
              Funding request <ModelledChip />
            </span>
          ) : (
            <p className="text-label">Funding request</p>
          )}
          <h3 className="text-heading mt-0.5 text-text-1">{displayName}</h3>
          {dossier ? (
            <p className="text-caption mt-0.5 text-text-2">
              {dossier.location} · {dossier.impact.homesEnabled} affordable homes
            </p>
          ) : null}
        </div>
        <StatusChip status={status.kind} label={status.label} />
      </header>

      <div>
        <p className="text-kpi-sm text-text-1">{formatEUR(proposal.amount)}</p>
        <p className="text-caption mt-1 text-text-2">{fundingCaption(proposal)}</p>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
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
            Closes at {window.closesAtLabel}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col items-stretch gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-caption min-w-0">
          {!isConnected
            ? "Connect a wallet to check your voting standing."
            : canVote
              ? votingOpen
                ? "You are cleared to vote on this proposal."
                : "Voting is closed for this proposal."
              : (eligibilityReason ?? "You are not cleared to vote yet.")}
        </p>
        {/* The decision is the primary action while voting is open; otherwise the
            project record is. The other is always reachable as a secondary link. */}
        <div className="flex flex-wrap items-center gap-2">
          {votingOpen && canVote ? (
            <>
              <Link
                href={govHref}
                className="btn btn-primary btn-sm flex-shrink-0"
                aria-label={`Review and vote on ${displayName}`}
              >
                Review &amp; vote
              </Link>
              <Link href={projectHref} className="btn btn-secondary btn-sm flex-shrink-0">
                View project
              </Link>
            </>
          ) : votingOpen ? (
            <>
              <Link
                href={govHref}
                className="btn btn-primary btn-sm flex-shrink-0"
                aria-label={`Open the governance memo for ${displayName}`}
              >
                View memo
              </Link>
              <Link href={projectHref} className="btn btn-ghost btn-sm flex-shrink-0">
                View project
              </Link>
            </>
          ) : (
            <>
              <Link
                href={projectHref}
                className="btn btn-primary btn-sm flex-shrink-0"
                aria-label={`Open the project record for ${displayName}`}
              >
                View project
              </Link>
              <Link href={govHref} className="btn btn-ghost btn-sm flex-shrink-0">
                Governance memo
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
