"use client";

import Link from "next/link";
import { DataTable, EmptyState, type Column } from "@/components/ui";
import { formatEUR, type PortfolioData, type PropertyDeed } from "@/lib/contracts";

export interface PropertyExposureProps {
  properties: PropertyDeed[];
  portfolio: PortfolioData;
}

interface ExposureRow {
  proposalId: number;
  tokenId: number;
  valuationEur: number;
  weightPct: number;
  exposureEur: number;
}

/**
 * J6: per-property exposure — your fund share applied to each deed the fund
 * holds. Weight = property valuation / NAV; exposure = your share of the fund
 * × the property's valuation. All inputs are real contract reads (deed NFTs,
 * FSFT supply, NAV); the split itself is arithmetic, not an on-chain claim.
 */
export function PropertyExposure({ properties, portfolio }: PropertyExposureProps) {
  const share =
    portfolio.totalSupply > 0 ? portfolio.balance / portfolio.totalSupply : 0;
  const nav = portfolio.navEur ?? 0;

  if (properties.length === 0 || share <= 0) {
    return (
      <EmptyState
        title="No property exposure yet"
        description={
          share <= 0
            ? "Once you hold fund shares, your slice of every home the fund owns appears here."
            : "The fund holds no property deeds yet — exposure appears once the first home is funded."
        }
      />
    );
  }

  const rows: ExposureRow[] = properties.map((deed) => ({
    proposalId: deed.proposalId,
    tokenId: deed.tokenId,
    valuationEur: deed.valuationEur,
    weightPct: nav > 0 ? (deed.valuationEur / nav) * 100 : 0,
    exposureEur: Math.floor(share * deed.valuationEur),
  }));

  const columns: Column<ExposureRow>[] = [
    {
      key: "property",
      header: "Property",
      render: (row) => (
        <Link
          href={`/governance/${row.proposalId}`}
          className="text-fs-teal-dark hover:underline"
        >
          Deed #{row.tokenId} (proposal #{row.proposalId})
        </Link>
      ),
    },
    {
      key: "valuationEur",
      header: "Property value",
      align: "right",
      render: (row) => <span className="text-mono">{formatEUR(row.valuationEur)}</span>,
    },
    {
      key: "weightPct",
      header: "Fund weight",
      align: "right",
      hideOnMobile: true,
      render: (row) => <span className="text-mono">{row.weightPct.toFixed(1)}%</span>,
    },
    {
      key: "exposureEur",
      header: "Your exposure",
      align: "right",
      render: (row) => (
        <span className="text-mono font-semibold">{formatEUR(row.exposureEur)}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.tokenId}
      caption="Your exposure to each property the fund holds"
      dense
    />
  );
}
