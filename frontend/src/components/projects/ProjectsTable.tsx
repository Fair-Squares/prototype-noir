import Link from "next/link";
import {
  Button,
  DataTable,
  EmptyState,
  type Column,
} from "@/components/ui";
import { formatEUR } from "@/lib/contracts";
import type { ProjectRow } from "./ProjectRow";
import { ProjectStatusChip } from "./ProjectStatusChip";

export interface ProjectsTableProps {
  rows: ProjectRow[];
  /** Connected wallet address — gates the eligibility/claim column. */
  address: string | null;
  /** Proposal id currently being claimed (disables that row's button). */
  claimingId: number | null;
  /** Invoke the on-chain claim for a project's distribution. */
  onClaim: (proposalId: number) => void;
}

function EligibilityCell({ row, connected }: { row: ProjectRow; connected: boolean }) {
  if (!connected) {
    return <span className="text-caption text-text-3">Connect wallet</span>;
  }
  if (!row.distributionOpened) {
    return <span className="text-caption text-text-3">—</span>;
  }
  if (row.hasClaimed) {
    return <span className="text-caption text-text-2">Claimed</span>;
  }
  const claimable = row.claimableAmount ?? 0;
  if (claimable > 0) {
    return (
      <span className="text-mono text-[var(--color-success)]">
        {formatEUR(claimable)}
      </span>
    );
  }
  return <span className="text-caption text-text-3">Not eligible</span>;
}

function ActionCell({
  row,
  connected,
  claiming,
  onClaim,
}: {
  row: ProjectRow;
  connected: boolean;
  claiming: boolean;
  onClaim: (id: number) => void;
}) {
  const canClaim =
    connected &&
    row.distributionOpened &&
    !row.hasClaimed &&
    (row.claimableAmount ?? 0) > 0;

  return (
    <div className="flex items-center justify-end gap-2">
      {canClaim ? (
        <Button
          size="sm"
          variant="primary"
          loading={claiming}
          onClick={() => onClaim(row.id)}
        >
          {claiming ? "Claiming…" : "Claim"}
        </Button>
      ) : null}
      <Link
        href={`/governance/${row.id}`}
        className="btn btn-secondary btn-sm"
      >
        {row.status === 0 ? "Vote" : "View"}
      </Link>
    </div>
  );
}

export function ProjectsTable({ rows, address, claimingId, onClaim }: ProjectsTableProps) {
  const connected = Boolean(address);

  const columns: Column<ProjectRow>[] = [
    {
      key: "project",
      header: "Project",
      render: (row) => (
        <div className="min-w-0">
          <span className="text-body font-medium text-text-1">
            Housing proposal #{row.id}
          </span>
          {row.hasDeed ? (
            <span className="text-caption mt-0.5 block text-text-3">
              Deed #{row.deedTokenId} held by fund
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
      key: "pool",
      header: "Fund-share pool",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.distributionOpened && row.distributionAmount != null ? (
          <span className="text-mono">{formatEUR(row.distributionAmount)}</span>
        ) : (
          <span className="text-caption text-text-3">—</span>
        ),
    },
    {
      key: "claimed",
      header: "Claimed",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.distributionOpened && row.distributionClaimed != null ? (
          <span className="text-mono text-text-2">{formatEUR(row.distributionClaimed)}</span>
        ) : (
          <span className="text-caption text-text-3">—</span>
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
          <span className="text-caption text-text-3">—</span>
        ),
    },
    {
      key: "eligibility",
      header: "Your eligibility",
      align: "right",
      render: (row) => <EligibilityCell row={row} connected={connected} />,
    },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      align: "right",
      render: (row) => (
        <ActionCell
          row={row}
          connected={connected}
          claiming={claimingId === row.id}
          onClaim={onClaim}
        />
      ),
    },
  ];

  return (
    <DataTable
      caption="Housing projects: on-chain proposals, their property deeds, and distributions."
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="No housing projects yet"
          description="Projects appear here once a funding proposal is created on-chain. Approved proposals become property deeds held by the fund."
        />
      }
    />
  );
}
