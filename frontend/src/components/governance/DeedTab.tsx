import Link from "next/link";
import { EmptyState, KpiCard, KpiGrid, Section, StatusChip } from "@/components/ui";
import { formatEUR, type PropertyDeed } from "@/lib/contracts";

export interface DeedTabProps {
  deed: PropertyDeed | null;
}

function truncate(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/**
 * Deed tab. If the request has been funded, an AIP-721 deed NFT exists for the
 * acquired home — its token id, valuation, and holder are shown. Otherwise an
 * honest empty state: no home has been acquired for this request yet.
 */
export function DeedTab({ deed }: DeedTabProps) {
  if (!deed) {
    return (
      <EmptyState
        title="No deed for this request yet"
        description="A deed NFT is minted to the fund only after the request is funded and the home is acquired. Until then there is nothing to show here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid cols={3}>
        <KpiCard label="Deed NFT" value={`#${deed.tokenId}`} sub="AIP-721" />
        <KpiCard label="Valuation" value={formatEUR(deed.valuationEur)} />
        <KpiCard
          label="Distribution"
          value={
            <StatusChip
              status={deed.distributionOpen ? "open" : "pending"}
              label={deed.distributionOpen ? "Open" : "Not open"}
            />
          }
        />
      </KpiGrid>

      <Section title="Holder">
        <p className="text-body text-mono min-w-0 break-all text-text-1">{truncate(deed.owner)}</p>
        <p className="text-caption mt-1">
          The deed is held by the housing fund on behalf of all depositors.
        </p>
        <Link href="/fund" className="btn btn-secondary btn-sm mt-4 inline-flex">
          View in Fund
        </Link>
      </Section>
    </div>
  );
}
