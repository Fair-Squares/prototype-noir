"use client";

import Link from "next/link";
import { DataTable, StatusChip, type Column } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import {
  displayStatus,
  proposalLabel,
  votingWindowFor,
} from "@/lib/proposalLifecycle";

/**
 * Compact preview of live funding requests for the Overview command center.
 *
 * A funding request is a governance proposal to commit fund capital to acquire
 * a home. We show the open/active ones first (the ones a member can act on),
 * fall back to the most recent if none are live, and link the whole section to
 * Governance for the full deal room. Status uses the shared governance helper
 * so a past-deadline-but-still-ACTIVE proposal reads "Voting ended", never a
 * stale "Active". Distribution status is shown when a funded request has opened
 * its payout. Proposal titles are not on-chain, so each row is labeled
 * "Housing proposal #N" — never an invented project name.
 */

function StatusCell({ proposal }: { proposal: Proposal }) {
  // A funded request whose distribution has opened is the most actionable
  // signal for members, so surface it ahead of the raw lifecycle status.
  if (proposal.distributionOpened) {
    return <StatusChip status="open" label="Distributing" />;
  }
  const s = displayStatus(proposal);
  return <StatusChip status={s.kind} label={s.label} />;
}

const columns: Column<Proposal>[] = [
  {
    key: "request",
    header: "Funding request",
    render: (p) => (
      <div className="min-w-0">
        <span className="text-body font-semibold text-text-1">
          {proposalLabel(p)}
        </span>
        <span className="text-caption block text-text-3">
          Capital to acquire one home
        </span>
      </div>
    ),
  },
  {
    key: "amount",
    header: "Requested",
    align: "right",
    render: (p) => (
      <span className="text-mono tabular-nums">{formatEUR(p.amount)}</span>
    ),
  },
  {
    key: "window",
    header: "Voting",
    align: "right",
    hideOnMobile: true,
    render: (p) => {
      // Only meaningful while the request is open for votes.
      if (p.status !== 0) {
        return <span className="text-caption text-text-3">—</span>;
      }
      const w = votingWindowFor(p);
      return (
        <span className="text-caption text-mono tabular-nums text-text-2">
          {w.closed ? "Closed" : `${w.remainingLabel} left`}
        </span>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    align: "right",
    render: (p) => <StatusCell proposal={p} />,
  },
];

/** Open/active requests sort to the top; then highest ask. */
function sortForPreview(proposals: Proposal[]): Proposal[] {
  return [...proposals].sort((a, b) => {
    const aLive = a.status === 0 ? 0 : 1;
    const bLive = b.status === 0 ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return b.amount - a.amount;
  });
}

export function FundingRequestsPreview({
  proposals,
  limit = 4,
}: {
  proposals: Proposal[];
  limit?: number;
}) {
  const rows = sortForPreview(proposals).slice(0, limit);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      caption="Live housing funding requests"
      empty={{
        title: "No funding requests yet",
        description: (
          <>
            When the committee proposes acquiring a home, the request appears
            here for members to review and vote on. See{" "}
            <Link href="/governance" className="text-fs-teal-dark hover:underline">
              Governance
            </Link>{" "}
            for the full history.
          </>
        ),
      }}
    />
  );
}
