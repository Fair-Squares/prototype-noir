"use client";

import {
  KpiCard,
  KpiGrid,
  SkeletonKpi,
} from "@/components/ui";
import {
  formatEUR,
  formatEURDecimals,
  type FundStats,
} from "@/lib/contracts";

/**
 * Fund-health headline. Answers "how much capital is available vs deployed"
 * at a glance. Every tile is backed by a real FundStats field — NAV, the
 * three states capital can be in (available / parked in DeFi / committed to
 * homes), and the investor + share-supply signals. No invented figures: NAV
 * and per-share value render an em-dash when the API omits them.
 */
export function FundHealthKpis({ stats }: { stats: FundStats }) {
  return (
    <KpiGrid cols={4}>
      <KpiCard
        label="Fund value (NAV)"
        value={stats.navEur != null ? formatEUR(stats.navEur) : "—"}
        sub="Capital backing every share"
        tone="accent"
        hint="Net asset value: the pooled capital (deposit principal, and property once marked) backing every Fund Share. Rent is a SEPARATE claimable earnings stream — it does not inflate NAV. No DeFi yield is included; there is no real yield source yet."
      />
      <KpiCard
        label="Available capital"
        value={formatEUR(stats.available)}
        sub={stats.available > 0 ? "Ready to deploy" : "Fully committed"}
        hint="Capital in the fund not yet parked in yield or committed to a home — what new acquisitions can draw on. €0 means every euro is already parked in yield or committed to a funded home."
      />
      <KpiCard
        label="Parked in DeFi"
        value={formatEUR(stats.totalInDefi)}
        sub="Held idle"
        hint="Idle capital set aside to be parked in a yield source. No real DeFi yield is earned yet — wiring a real yield adapter is future work (see docs/PHASE1_YIELD_AND_RENT.md)."
      />
      <KpiCard
        label="Committed to homes"
        value={formatEUR(stats.totalAllocated)}
        sub="Acquisitions funded"
        hint="Capital committed to acquiring property through approved funding requests."
      />
    </KpiGrid>
  );
}

/**
 * Secondary participation row: who and how much. Investor count and FSFT share
 * supply (with NAV per share when known) are the only membership signals the
 * fund exposes.
 */
export function FundParticipationKpis({ stats }: { stats: FundStats }) {
  return (
    <KpiGrid cols={2}>
      <KpiCard
        label="Verified investors"
        value={stats.investorCount.toLocaleString()}
        sub="Members in the fund"
        hint="Distinct verified members holding a position in the fund."
      />
      <KpiCard
        label="Fund shares (FSFT)"
        value={stats.totalSupply.toLocaleString()}
        sub={
          stats.navPerFsftEur != null
            ? `${formatEURDecimals(stats.navPerFsftEur)} per share`
            : "Shares outstanding"
        }
        hint="FSFT shares outstanding. Each is a claim on a slice of the fund's net asset value."
      />
    </KpiGrid>
  );
}

/** Skeleton matching the four fund-health tiles. */
export function FundHealthKpisSkeleton() {
  return (
    <KpiGrid cols={4}>
      <SkeletonKpi />
      <SkeletonKpi />
      <SkeletonKpi />
      <SkeletonKpi />
    </KpiGrid>
  );
}
