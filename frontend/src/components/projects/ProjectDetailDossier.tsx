import {
  AdvancedDetails,
  InfoDot,
  KpiCard,
  KpiGrid,
  ModelledChip,
  StatusChip,
  type StatusKind,
} from "@/components/ui";
import { formatEUR, type FundStats, type Proposal, type PropertyDeed } from "@/lib/contracts";
import {
  SMALL_DEPOSITOR_FLOOR_PCT,
  type MilestoneStatus,
  type ProjectDossier,
} from "@/lib/projectDossier";
import { CapitalStack } from "./CapitalStack";
import { ReturnsCapPanel } from "./ReturnsCapPanel";

const MILESTONE_STATUS: Record<MilestoneStatus, { kind: StatusKind; label: string }> = {
  done: { kind: "completed", label: "Done" },
  active: { kind: "active", label: "In progress" },
  upcoming: { kind: "pending", label: "Upcoming" },
};

/**
 * D1 — the project-finance dossier (FUTURE_DEVELOPMENT_PLAN.md §2.0, §9.2). The
 * housing-first view a partner actually wants on a call: what gap is being
 * closed, how the capital stack fits together, what affordability is protected,
 * and the impact — overlaid on the real on-chain funding request.
 *
 * Everything here except the on-chain bridge line is MODELLED and tagged as
 * such. Sensitive rows are role-gated: public aggregates for everyone, sensitive
 * detail only for verified viewers (the privacy-by-role idea, made concrete).
 */
export function ProjectDetailDossier({
  proposal,
  dossier,
  canViewSensitive,
  fundStats,
}: {
  proposal: Proposal;
  /** Accepted for forward-compat (deed valuation), not yet rendered here. */
  deed?: PropertyDeed | null;
  fundStats?: FundStats | null;
  dossier: ProjectDossier;
  canViewSensitive: boolean;
}) {
  const { covenant, impact } = dossier;

  return (
    <div className="space-y-5">
      {/* Lead: housing-first summary + the modelled disclosure up front. */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label">Project dossier</p>
            <h2 className="text-heading mt-0.5 text-text-1">{dossier.name}</h2>
            <p className="text-caption mt-0.5 text-text-2">{dossier.location}</p>
          </div>
          <ModelledChip
            label="Modelled for demo"
            hint="This dossier is illustrative project-finance detail overlaid on the real on-chain funding request. The capital stack, covenant, milestones and impact are modelled; the proposal amount, votes, distribution and deed are real on-chain figures shown in the other tabs."
            hintAlign="right"
          />
        </div>
        <p className="text-body mt-3 max-w-prose text-text-2">{dossier.summary}</p>
      </section>

      {/* Headline impact — the housing KPIs lead, not the token mechanics. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-heading text-text-1">Impact</h2>
          <ModelledChip />
        </div>
        <KpiGrid cols={4}>
          <KpiCard
            label="Homes enabled"
            value={impact.homesEnabled.toLocaleString()}
            tone="accent"
            sub="Affordable homes this project delivers"
          />
          <KpiCard
            label="Affordability locked"
            value={`${covenant.lockYears} yrs`}
            sub="Covenant protects the rent band"
          />
          <KpiCard
            label="Rent vs. market"
            value={`−${impact.rentDiscountPct}%`}
            tone="success"
            sub="Discount for the target group"
          />
          <KpiCard
            label="Financing gap closed"
            value={formatEUR(dossier.financingGapEur)}
            sub="The documented onrendabele top"
          />
        </KpiGrid>
      </section>

      {/* Capital stack — the financeability story, with the on-chain bridge. */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading inline-flex items-center gap-1 text-text-1">
            Capital stack
            <InfoDot
              label="What is the capital stack"
              content="How a project is paid for, layer by layer — senior bank debt, public subsidy, member capital, and the Fair Squares capped-return layer that closes the remaining gap."
            />
          </h2>
          <ModelledChip />
        </div>
        <p className="text-caption mt-1 max-w-prose text-text-2">
          The financeability picture every partner asks for: who funds what, and the gap Fair
          Squares closes with capped-return capital.
        </p>
        <div className="mt-4">
          <CapitalStack
            tranches={dossier.capitalStack}
            totalEur={dossier.totalBudgetEur}
            onChainAmountEur={proposal.amount}
          />
        </div>
      </section>

      {/* The documented gap (onrendabele top). */}
      <section className="surface border-dashed p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading inline-flex items-center gap-1 text-text-1">
            The financing gap
            <InfoDot
              label="What is the onrendabele top"
              content="The 'unprofitable top' — the slice of a socially necessary project that bank debt, subsidy and member capital cannot carry. Funding this documented gap (not vague ambition) is the wedge Fair Squares targets."
            />
          </h2>
          <ModelledChip />
        </div>
        <p className="text-body mt-2 max-w-prose text-text-2">
          Senior debt, subsidy and member capital leave a documented{" "}
          <span className="text-mono text-text-1">{formatEUR(dossier.financingGapEur)}</span>{" "}
          <span className="italic">onrendabele top</span>. Fair Squares closes it with
          capped-return capital under the covenant below — making a socially necessary project
          financeable without bidding up land prices.
        </p>
      </section>

      {/* Affordability covenant. */}
      <CovenantCard dossier={dossier} />

      {/* Capped return — cost-based ROR rent, fully to investors (D2). */}
      <ReturnsCapPanel
        cappedReturnPct={covenant.cappedReturnPct}
        rorOnChain={fundStats?.rorBps ? fundStats.rorBps / 100 : undefined}
      />

      {/* Milestones. */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading text-text-1">Milestones</h2>
          <ModelledChip />
        </div>
        <ol className="mt-4 flex flex-col divide-y divide-border">
          {dossier.milestones.map((m) => {
            const meta = MILESTONE_STATUS[m.status];
            return (
              <li
                key={m.key}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="text-body block truncate text-text-1">{m.label}</span>
                  <span className="text-caption text-text-3">{m.when}</span>
                </span>
                <StatusChip status={meta.kind} label={meta.label} />
              </li>
            );
          })}
        </ol>
      </section>

      {/* Rent-to-equity teaser (the tenant differentiator, §3.4 / D3). */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading text-text-1">Tenants build equity</h2>
          <span className="inline-flex items-center gap-2">
            <ModelledChip />
            <StatusChip status="pending" label="On the roadmap" />
          </span>
        </div>
        <p className="text-body mt-2 max-w-prose text-text-2">{dossier.rentToEquity}</p>
        <p className="text-caption mt-2 text-text-3">
          The small-depositor floor already over-allocates{" "}
          <span className="text-mono text-text-2">{SMALL_DEPOSITOR_FLOOR_PCT}%</span> of every
          distribution to small savers on-chain — the same equity-first principle, extended to
          the people who live in the home.
        </p>
      </section>

      {/* Role-gated sensitive detail — privacy-by-role made concrete. */}
      <section className="surface p-5">
        <h2 className="text-heading inline-flex items-center gap-1 text-text-1">
          Sensitive detail
          <InfoDot
            label="Why is some detail gated"
            content="Public aggregates (gap closed, % affordable, covenant) are visible to all; sensitive rows — individual member capital, eligibility evidence, underwriting — are shown only to verified parties. The same public/private split the protocol enforces on-chain."
          />
        </h2>
        {canViewSensitive ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusChip status="verified" label="Unlocked for verified viewer" />
              <ModelledChip />
            </div>
            <AdvancedDetails summary="Show sensitive rows">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {dossier.sensitive.map((row) => (
                  <div key={row.label}>
                    <dt className="text-label">{row.label}</dt>
                    <dd className="text-body mt-0.5 text-text-1">{row.value}</dd>
                    {row.note ? (
                      <dd className="text-caption mt-0.5 text-text-3">{row.note}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </AdvancedDetails>
          </>
        ) : (
          <div className="mt-2">
            <StatusChip status="blocked" label="Verified parties only" />
            <p className="text-caption mt-2 max-w-prose text-text-2">
              Individual member capital, key-worker eligibility evidence and underwriting notes
              are visible only to verified investors and committee members. Connect a wallet
              with investor standing to view them — the aggregates above stay public to
              everyone.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function CovenantCard({ dossier }: { dossier: ProjectDossier }) {
  const { covenant } = dossier;
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading text-text-1">Affordability covenant</h2>
        <ModelledChip />
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-label">Rent band</dt>
          <dd className="text-body mt-0.5 text-text-1">{covenant.rentBand}</dd>
        </div>
        <div>
          <dt className="text-label">Target group</dt>
          <dd className="text-body mt-0.5 text-text-1">{covenant.targetGroup}</dd>
        </div>
        <div>
          <dt className="text-label">Locked for</dt>
          <dd className="text-body mt-0.5 text-text-1">
            <span className="text-mono">{covenant.lockYears}</span> years
          </dd>
        </div>
        <div>
          <dt className="text-label">Investor return</dt>
          <dd className="text-body mt-0.5 text-text-1">
            Capped at <span className="text-mono">~{covenant.cappedReturnPct}% net / year</span>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-label">Clawback</dt>
          <dd className="text-body mt-0.5 text-text-2">{covenant.clawback}</dd>
        </div>
      </dl>
    </section>
  );
}
