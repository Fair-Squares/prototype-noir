import Link from "next/link";
import { KpiCard, KpiGrid, ModelledChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import { aggregateImpact } from "@/lib/projectDossier";

/** Optional fund facts: modelled housing totals and the small-depositor allocation. */
export function ImpactStrip({ proposals }: { proposals: Proposal[] }) {
  const impact = aggregateImpact(proposals);

  return (
    <section className="space-y-3" aria-label="Affordable-housing impact">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-heading text-text-1">Affordable-housing impact</h2>
        <ModelledChip />
      </div>
      <p className="text-caption text-text-2">
        Housing totals are estimates based on funded project plans.{" "}
        <Link href="/learn#privacy" className="text-fs-teal-dark hover:underline">
          How this stays private
        </Link>
        .
      </p>
      <KpiGrid cols={4}>
        <KpiCard
          label="Homes enabled"
          value={impact.hasModelledImpact ? impact.homesEnabled.toLocaleString() : "—"}
          tone="accent"
          sub={
            impact.hasModelledImpact
              ? `Across ${impact.projectsFunded} funded project${impact.projectsFunded === 1 ? "" : "s"}`
              : "Once a project with a dossier is funded"
          }
        />
        <KpiCard
          label="Affordability-years"
          value={impact.hasModelledImpact ? impact.affordabilityYears.toLocaleString() : "—"}
          sub="Affordable homes × covenant years"
        />
        <KpiCard
          label="Capital gap closed"
          value={impact.hasModelledImpact ? formatEUR(impact.gapClosedEur) : "—"}
          sub="Funding gaps covered"
        />
        <KpiCard
          label="Small-saver allocation"
          value={`${impact.smallDepositorFloorPct}%`}
          tone="success"
          sub="Reserved for small deposits"
          hint="The fund reserves 30% of each payout for small depositors, divided in proportion to their deposits, in addition to their priority allocation."
        />
      </KpiGrid>
    </section>
  );
}
