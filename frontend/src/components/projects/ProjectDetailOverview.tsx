import Link from "next/link";
import { InfoDot, StatusChip } from "@/components/ui";
import {
  displayStatus,
  proposalLabel,
  quorumFor,
  votingWindowFor,
} from "@/components/governance/governanceStatus";
import { formatEUR, type FundStats, type Proposal } from "@/lib/contracts";

/**
 * Overview tab of the investment memo. Leads with the plain-language ask and an
 * honest lifecycle chip, then frames the requested capital against what the fund
 * actually has available right now. Only on-chain / fetched fields are shown.
 */
export function ProjectDetailOverview({
  proposal,
  fundStats,
}: {
  proposal: Proposal;
  fundStats: FundStats | null;
}) {
  const status = displayStatus(proposal);
  const window = votingWindowFor(proposal);
  const quorum = quorumFor(proposal);
  const isActive = proposal.status === 0;

  // Honest capital context: does the fund currently hold enough uncommitted
  // capital to satisfy this ask? Derived purely from fetched fund stats.
  const available = fundStats?.available ?? null;
  const coversAsk = available !== null ? available >= proposal.amount : null;

  return (
    <div className="space-y-5">
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label">Capital requested</p>
            <p className="text-kpi mt-0.5 text-text-1">{formatEUR(proposal.amount)}</p>
            <p className="text-caption mt-2 max-w-prose text-text-2">
              If the investor committee approves {proposalLabel(proposal)}, the
              fund commits this capital to acquire one affordable home. Tenants
              rent it; depositors hold the upside through the fund.
            </p>
          </div>
          <StatusChip status={status.kind} label={status.label} />
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-heading text-text-1">Capital context</h2>
        <p className="text-caption mt-0.5 text-text-2">
          The ask measured against the fund&apos;s uncommitted capital today.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-label">Requested capital</dt>
            <dd className="text-body mt-0.5 text-mono text-text-1">
              {formatEUR(proposal.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-label inline-flex items-center gap-1">
              Fund available
              <InfoDot
                label="What is fund available"
                content="Capital depositors have placed in the fund that is not yet committed to a home or parked in DeFi — i.e. what is on hand to fund new acquisitions."
              />
            </dt>
            <dd className="text-body mt-0.5 text-mono text-text-1">
              {available !== null ? formatEUR(available) : "—"}
            </dd>
          </div>
        </dl>

        {coversAsk !== null ? (
          <p className="text-caption mt-4 text-text-2">
            {coversAsk
              ? "The fund currently holds enough uncommitted capital to cover this ask."
              : "The fund does not yet hold enough uncommitted capital to cover this ask on its own."}
          </p>
        ) : null}
      </section>

      {isActive ? (
        <div className="surface p-5">
          <h2 className="text-heading text-text-1">
            {window.closed ? "Voting window closed" : "Voting is open"}
          </h2>
          <p className="text-caption mt-1 text-text-2">
            {window.closed ? (
              <>This request is awaiting finalisation. </>
            ) : (
              <>
                {window.remainingLabel} remaining ·{" "}
                {quorum.reached ? "quorum met" : "quorum not yet met"} (
                <span className="text-mono">
                  {quorum.total.toLocaleString()}/
                  {quorum.required.toLocaleString()}
                </span>
                ).{" "}
              </>
            )}
            See the Governance tab to review the tally, or open the full memo.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href={`/governance/${proposal.id}`} className="btn btn-secondary btn-sm">
          Open governance memo
        </Link>
      </div>
    </div>
  );
}
