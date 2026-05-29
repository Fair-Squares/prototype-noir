"use client";

import { Button, DataTable, EmptyState, StatusChip, type Column } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";

export interface ClaimableByProposalProps {
  /** Proposals with an open distribution the caller can claim from. */
  proposals: Proposal[];
  /** id currently being claimed, or null. */
  claimingId: number | null;
  onClaim: (proposalId: number) => void;
  disabled?: boolean;
}

/**
 * Claimable-by-project table. A "project" is an on-chain proposal + its
 * distribution, so each row is labelled "Housing proposal #N" with its
 * approved amount — proposal titles are not on-chain. Only proposals with a
 * positive claimableAmount are passed in by the page.
 */
export function ClaimableByProposal({
  proposals,
  claimingId,
  onClaim,
  disabled = false,
}: ClaimableByProposalProps) {
  if (proposals.length === 0) {
    return (
      <EmptyState
        title="Nothing to claim right now"
        description="When a housing proposal you backed opens a distribution, your claimable share will appear here."
      />
    );
  }

  const columns: Column<Proposal>[] = [
    {
      key: "project",
      header: "Project",
      render: (p) => (
        <div className="min-w-0">
          <p className="text-body text-text-1">Housing proposal #{p.id}</p>
          <p className="text-caption text-text-3">Approved {formatEUR(p.amount)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) =>
        p.hasClaimed ? (
          <StatusChip status="claimed" />
        ) : (
          <StatusChip status="open" label="Distribution open" />
        ),
    },
    {
      key: "claimable",
      header: "Your claimable",
      align: "right",
      render: (p) => (
        <span className="text-mono text-text-1">{formatEUR(p.claimableAmount ?? 0)}</span>
      ),
    },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      align: "right",
      render: (p) => {
        const isClaiming = claimingId === p.id;
        return (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onClaim(p.id)}
            loading={isClaiming}
            disabled={disabled || p.hasClaimed || (p.claimableAmount ?? 0) <= 0}
          >
            {p.hasClaimed ? "Claimed" : isClaiming ? "Claiming…" : "Claim"}
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={proposals}
      rowKey={(p) => p.id}
      caption="Distributions you can claim, by housing proposal"
    />
  );
}
