import Link from "next/link";
import { Button, InfoDot } from "@/components/ui";
import {
  proposalLabel,
  quorumFor,
  votingWindowFor,
} from "@/components/governance/governanceStatus";
import { formatEUR } from "@/lib/contracts";
import { ProjectStatusChip } from "./ProjectStatusChip";
import { distributionClaimedFraction, type ProjectRow } from "./ProjectRow";

export interface ProjectCardProps {
  row: ProjectRow;
  /** Connected wallet address — gates the eligibility / claim affordance. */
  address: string | null;
  /** True while this row's distribution claim is in flight. */
  claiming: boolean;
  /** Invoke the on-chain claim for this project's distribution. */
  onClaim: (proposalId: number) => void;
}

/** A labelled progress meter; status is always carried in adjacent text. */
function Meter({ fraction, tone }: { fraction: number; tone: "accent" | "success" }) {
  const pct = Math.round(fraction * 100);
  const color = tone === "success" ? "var(--color-success)" : "var(--color-accent)";
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      role="presentation"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/**
 * One housing project as a deal-room line item. Reads top-to-bottom as a memo:
 * what capital the home needs and its lifecycle status first, then the live
 * committee maths or the distribution flowing back, then the reader's own
 * position, then a link into the full governance memo. Only on-chain fields are
 * shown — no location, unit counts, covenant terms or capped-return figures,
 * because none of those are recorded on-chain.
 */
export function ProjectCard({ row, address, claiming, onClaim }: ProjectCardProps) {
  const connected = Boolean(address);
  const window = votingWindowFor(row.proposal);
  const quorum = quorumFor(row.proposal);
  const isActive = row.status === 0;
  const votingOpen = isActive && !window.closed;
  const distFraction = distributionClaimedFraction(row);
  const canClaim =
    connected &&
    row.distributionOpened &&
    !row.hasClaimed &&
    (row.claimableAmount ?? 0) > 0;

  // A short, honest note about the reader's own standing. Null when the
  // claimable amount itself is the message (rendered below as its own line).
  const positionNote: string | null = !connected
    ? "Connect a wallet to see your eligibility."
    : !row.distributionOpened
      ? "No distribution open yet for this project."
      : row.hasClaimed
        ? "You have claimed your share of this distribution."
        : canClaim
          ? null
          : "You have no claimable share of this distribution.";

  return (
    <article className="surface flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Funding request</p>
          <h3 className="text-heading mt-0.5 text-text-1">{proposalLabel(row.proposal)}</h3>
          {row.hasDeed ? (
            <p className="text-caption mt-0.5 text-text-2">
              Acquired · property deed held by the fund
            </p>
          ) : null}
        </div>
        <ProjectStatusChip row={row} />
      </header>

      <div>
        <p className="text-kpi-sm text-text-1">{formatEUR(row.requestedAmount)}</p>
        <p className="text-caption mt-1 text-text-2">
          Capital the fund commits to acquire this home if the committee approves.
        </p>
      </div>

      {/* Pre-funding: show the committee maths. Post-funding: show payout flow. */}
      {row.distributionOpened ? (
        <div className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label inline-flex items-center gap-1">
              Distribution to depositors
              <InfoDot
                label="What is the distribution"
                content="When a funded home's value is realised, the proceeds open as a pool depositors claim pro-rata against the deposits snapshotted at that moment."
              />
            </span>
            <span className="text-mono text-text-1">
              {formatEUR(row.distributionAmount ?? 0)}
            </span>
          </div>
          {distFraction !== null ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <Meter
                fraction={distFraction}
                tone={distFraction >= 1 ? "success" : "accent"}
              />
              <p className="text-caption">
                <span className="text-mono text-text-1">
                  {formatEUR(row.distributionClaimed ?? 0)}
                </span>{" "}
                of{" "}
                <span className="text-mono text-text-1">
                  {formatEUR(row.distributionAmount ?? 0)}
                </span>{" "}
                claimed
                {distFraction >= 1 ? " — fully distributed." : "."}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
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
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-label">Your position</p>
          {positionNote ? (
            <p className="text-caption mt-0.5">{positionNote}</p>
          ) : null}
          {connected && canClaim ? (
            <p className="text-mono mt-0.5 text-[var(--color-success)]">
              {formatEUR(row.claimableAmount ?? 0)} claimable
            </p>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {canClaim ? (
            <Button
              size="sm"
              variant="primary"
              loading={claiming}
              onClick={() => onClaim(row.id)}
            >
              {claiming ? "Claiming…" : "Claim share"}
            </Button>
          ) : null}
          <Link
            href={`/fund/${row.id}`}
            className="btn btn-secondary btn-sm"
            aria-label={`Open the investment memo for ${proposalLabel(row.proposal)}`}
          >
            View memo
          </Link>
          <Link
            href={`/governance/${row.id}`}
            className="btn btn-ghost btn-sm"
            aria-label={`Open the governance memo for ${proposalLabel(row.proposal)}`}
          >
            {votingOpen ? "Review & vote" : "Governance memo"}
          </Link>
        </div>
      </div>
    </article>
  );
}
