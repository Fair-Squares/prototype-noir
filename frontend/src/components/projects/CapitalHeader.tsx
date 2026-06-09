import { InfoDot, KpiCard, KpiGrid, SkeletonKpi, StatusChip } from "@/components/ui";
import { formatEUR, formatEURDecimals, type FundStats } from "@/lib/contracts";

export interface CapitalHeaderProps {
  stats: FundStats | null;
  loading: boolean;
}

/**
 * The capital context for the deal room: what the pool can still deploy into a
 * new home, what is set aside for a future yield source, and what is committed
 * to funded projects. Every figure comes straight from `fetchFundStats` — no
 * derived "funding gap" or "homes enabled" is invented.
 */
export function CapitalHeader({ stats, loading }: CapitalHeaderProps) {
  if (loading && !stats) {
    return (
      <KpiGrid cols={3}>
        <SkeletonKpi />
        <SkeletonKpi />
        <SkeletonKpi />
      </KpiGrid>
    );
  }
  if (!stats) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {stats.source === "simulation" ? (
          <StatusChip status="simulation" label="Simulation data" />
        ) : null}
        {stats.isPaused ? (
          <StatusChip status="blocked" label="Fund paused" />
        ) : null}
      </div>

      <KpiGrid cols={3}>
        <KpiCard
          label="Available to deploy"
          value={formatEUR(stats.available)}
          sub="Uncommitted EUR ready for the next home"
        />
        <KpiCard
          label="Parked (idle)"
          value={formatEUR(stats.totalInDefi)}
          tone="accent"
          sub="Set aside for a future yield source — none active yet"
        />
        <KpiCard
          label="Committed to projects"
          value={formatEUR(stats.totalAllocated)}
          sub="Capital allocated to funded housing"
        />
      </KpiGrid>

      {typeof stats.navEur === "number" ? (
        <p className="text-caption text-text-2">
          <span className="inline-flex items-center gap-1">
            Fund NAV{" "}
            <InfoDot
              label="What is NAV"
              content="Net asset value: the fund's pooled capital backing every Fund Share (deposit principal, and property once marked). Rent is a separate claimable earnings stream and is not included in NAV."
            />
          </span>{" "}
          <span className="text-mono text-text-1">{formatEUR(stats.navEur)}</span>
          {typeof stats.navPerFsftEur === "number" ? (
            <>
              {" · "}
              <span className="text-mono text-text-1">
                {formatEURDecimals(stats.navPerFsftEur)}
              </span>{" "}
              per Fund Share
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
