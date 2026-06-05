"use client";

import { DataTable, ModelledChip, StatusChip, type Column } from "@/components/ui";
import { formatEUR, type PropertyDeed } from "@/lib/contracts";
import { getProjectDossier } from "@/lib/projectDossier";

/**
 * Compact preview of active housing projects, drawn from on-chain property
 * deeds (AIP-721). A project is a passed proposal + the deed the fund acquired
 * for it. Proposal titles are not on-chain, so each row is labeled by its
 * proposal number and valuation — never an invented name.
 */

const columns: Column<PropertyDeed>[] = [
  {
    key: "project",
    header: "Project",
    render: (p) => {
      const dossier = getProjectDossier({ id: p.proposalId, title: "" });
      return (
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-text-1">
              {dossier?.name ?? `Housing proposal #${p.proposalId}`}
            </span>
            {dossier ? <ModelledChip label="Modelled" /> : null}
          </span>
          <span className="text-caption block text-text-3">
            {dossier ? `${dossier.location} · ` : ""}
            <span className="text-mono">Deed #{p.tokenId}</span>
          </span>
        </div>
      );
    },
  },
  {
    key: "valuation",
    header: "Valuation",
    align: "right",
    render: (p) => (
      <span className="text-mono tabular-nums">{formatEUR(p.valuationEur)}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    align: "right",
    render: (p) =>
      p.distributionOpen ? (
        <StatusChip status="open" label="Distributing" />
      ) : (
        <StatusChip status="active" label="Held" />
      ),
  },
];

export function ProjectsPreview({
  properties,
  limit = 4,
}: {
  properties: PropertyDeed[];
  limit?: number;
}) {
  const rows = properties.slice(0, limit);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.tokenId}
      caption="Active housing projects"
      empty={{
        title: "No housing projects yet",
        description:
          "Acquisitions appear here once a funding proposal passes and the fund takes the property deed.",
      }}
    />
  );
}
