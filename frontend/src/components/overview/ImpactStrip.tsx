import Link from "next/link";
import { KpiCard, KpiGrid, ModelledChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import { aggregateImpact } from "@/lib/projectDossier";

/**
 * D4 — the impact strip (FUTURE_DEVELOPMENT_PLAN.md §9.2). A compact, housing-
 * first summary that leads the Overview: homes enabled, affordability-years
 * locked, capital gap closed, and the share floored to small savers. It proves
 * the equity claim at a glance.
 *
 * Homes / affordability-years / gap are MODELLED (from the project dossiers
 * attached to funded proposals) and tagged accordingly; the small-depositor
 * floor is a REAL on-chain parameter (SMALL_POOL_BPS) and is labelled as such.
 * The privacy/proof state lives in the always-visible TrustChip in the top bar.
 */
export function ImpactStrip({ proposals }: { proposals: Proposal[] }) {
  const impact = aggregateImpact(proposals);

  return (
    <section className="space-y-3" aria-label="Affordable-housing impact">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-heading text-text-1">Affordable-housing impact</h2>
        <ModelledChip />
      </div>
      <p className="text-caption text-text-2">
        Homes, affordability-years and gap closed are modelled for the demo from each project&apos;s
        dossier; the small-saver floor is a live on-chain parameter.{" "}
        <Link href="/explain#privacy" className="text-fs-teal-dark hover:underline">
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
          sub="Documented onrendabele top funded"
        />
        <KpiCard
          label="Floored to small savers"
          value={`${impact.smallDepositorFloorPct}%`}
          tone="success"
          sub="Live on-chain floor on every distribution"
          hint="A real on-chain parameter (SMALL_POOL_BPS): 30% of every distribution is reserved pro-rata for small depositors, on top of their FIFO share — equity by design."
        />
      </KpiGrid>
    </section>
  );
}
