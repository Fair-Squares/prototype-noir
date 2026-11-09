import { DataTable, EmptyState, type Column } from "@/components/ui";
import { formatEUR, formatFSFT } from "@/lib/contracts";
import { votingWindowFor } from "@/lib/proposalLifecycle";
import type { ProjectRow } from "./ProjectRow";
import { ProjectStatusChip } from "./ProjectStatusChip";

export interface ProjectsTableProps {
  rows: ProjectRow[];
}

/** Em dash for an absent on-chain field — kept consistent across columns. */
function Empty() {
  return <span className="text-caption text-text-3">—</span>;
}

/**
 * The dense, read-only on-chain view of every funding request. This is the
 * explorer-style table the design doc reserves for transparency: raw amounts,
 * deed token ids, distribution snapshots and block windows. The calm primary
 * flow (claim / vote / your position) lives in the ProjectCard list above; this
 * table only reports the underlying fields verbatim.
 */
export function ProjectsTable({ rows }: ProjectsTableProps) {
  const columns: Column<ProjectRow>[] = [
    {
      key: "project",
      header: "Request",
      render: (row) => (
        <div className="min-w-0">
          <span className="text-body font-medium text-text-1">#{row.id}</span>
          {row.hasDeed ? (
            <span className="text-caption mt-0.5 block text-text-3">
              Deed token #{row.deedTokenId}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "requested",
      header: "Requested",
      align: "right",
      render: (row) => <span className="text-mono">{formatEUR(row.requestedAmount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <ProjectStatusChip row={row} />,
    },
    {
      key: "votes",
      header: "Yes / No",
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-mono text-text-2">
          {row.yesVotes.toLocaleString()} / {row.noVotes.toLocaleString()}
        </span>
      ),
    },
    {
      key: "window",
      header: "Closes",
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-mono text-text-2">
          {votingWindowFor(row.proposal).closesAtLabel}
        </span>
      ),
    },
    {
      key: "pool",
      header: "Payout pool",
      align: "right",
      hideOnMobile: true,
      // Distributions mint Fund Shares (FSFT), not euros — see formatFSFT.
      render: (row) =>
        row.distributionOpened && row.distributionAmount != null ? (
          <span className="text-mono">{formatFSFT(row.distributionAmount)}</span>
        ) : (
          <Empty />
        ),
    },
    {
      key: "claimed",
      header: "Claimed",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.distributionOpened && row.distributionClaimed != null ? (
          <span className="text-mono text-text-2">{formatFSFT(row.distributionClaimed)}</span>
        ) : (
          <Empty />
        ),
    },
    {
      key: "snapshot",
      header: "Snapshot deposits",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.distributionSnapshotDeposits != null ? (
          <span className="text-mono text-text-2">
            {formatEUR(row.distributionSnapshotDeposits)}
          </span>
        ) : (
          <Empty />
        ),
    },
    {
      key: "valuation",
      header: "Deed valuation",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.valuationEur != null ? (
          <span className="text-mono">{formatEUR(row.valuationEur)}</span>
        ) : (
          <Empty />
        ),
    },
    {
      // J6: the covenant terms voted with the request — capped monthly rent
      // and, when the backing listing carries a market reference, the
      // discount vs market (the RentComparison surface, table-dense form).
      key: "covenantRent",
      header: "Covenant rent",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.cappedMonthlyRentEur != null ? (
          <span className="text-mono">
            {formatEUR(row.cappedMonthlyRentEur)}/mo
            {row.rentDiscountPct != null ? (
              <span
                className={
                  row.rentDiscountPct >= 20
                    ? "ml-1 font-semibold text-[var(--color-success)]"
                    : "ml-1 text-text-2"
                }
              >
                (−{row.rentDiscountPct}%)
              </span>
            ) : null}
          </span>
        ) : (
          <Empty />
        ),
    },
    {
      key: "lock",
      header: "Lock",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.lockYears != null ? (
          <span className="text-mono text-text-2">{row.lockYears} yrs</span>
        ) : (
          <Empty />
        ),
    },
  ];

  return (
    <DataTable
      dense
      caption="On-chain fields for every funding request: amounts, votes, distribution pool, snapshot deposits, deed valuation and covenant terms."
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="No funding requests on-chain yet"
          description="Each row appears once a funding proposal is created. Approved requests become property deeds held by the fund."
        />
      }
    />
  );
}
