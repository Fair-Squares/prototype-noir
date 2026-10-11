"use client";

import Link from "next/link";
import { ModelledChip, StatusChip } from "@/components/ui";
import { displayStatus } from "@/lib/proposalLifecycle";
import { formatEUR, type Proposal } from "@/lib/contracts";
import type { ProjectDossier } from "@/lib/projectDossier";

/**
 * The Home hero: ONE featured affordable-housing project, leading with the
 * housing story (name, location, the documented financing gap it closes, the
 * affordability covenant) and a single CTA into its dossier. This is the
 * "housing first, mechanics second" lead — the project-finance figures are
 * modelled for the demo (one ModelledChip + a note), while the lifecycle status
 * is the real on-chain proposal state.
 */
export function FeaturedProject({
  proposal,
  dossier,
  ctaPrimary = true,
}: {
  proposal: Proposal;
  dossier: ProjectDossier;
  /** Render the "Explore project" CTA as the page's primary action. */
  ctaPrimary?: boolean;
}) {
  const status = displayStatus(proposal);

  return (
    <section className="surface overflow-hidden" aria-labelledby="featured-heading">
      <div className="grid md:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-4 p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label">Featured project</span>
            <StatusChip status={status.kind} label={status.label} />
          </div>

          <div>
            <h2 id="featured-heading" className="text-display text-text-1">
              {dossier.name}
            </h2>
            <p className="text-caption mt-1 text-text-3">{dossier.location}</p>
          </div>

          <p className="text-body max-w-prose text-text-2">{dossier.summary}</p>

          <dl className="grid grid-cols-3 gap-3">
            <Fact label="Affordable homes" value={dossier.impact.homesEnabled.toLocaleString()} />
            <Fact label="Financing gap" value={formatEUR(dossier.financingGapEur)} />
            <Fact label="Affordability" value={`${dossier.covenant.lockYears} yrs`} />
          </dl>

          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={`/fund/${proposal.id}`}
              className={`btn ${ctaPrimary ? "btn-primary" : "btn-secondary"} flex-shrink-0`}
            >
              Explore project
            </Link>
            <span className="inline-flex items-center gap-2">
              <ModelledChip />
              <span className="text-caption text-text-3">
                Illustrative project, not a live offer
              </span>
            </span>
          </div>
        </div>

        <div className="hidden items-center justify-center bg-fs-mint p-6 md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/illustrations/housing-fund.png"
            width={707}
            height={1095}
            alt=""
            aria-hidden="true"
            className="max-h-60 w-auto object-contain"
          />
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label">{label}</dt>
      <dd className="text-kpi-sm mt-0.5 text-text-1">{value}</dd>
    </div>
  );
}
