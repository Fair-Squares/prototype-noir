import { ModelledChip } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";
import { CAPPED_RETURN_PCT, modelledReturnSplit } from "@/lib/projectDossier";

/**
 * D2 — capped-return + affordability-reserve display (FUTURE_DEVELOPMENT_PLAN.md
 * §4.0, §9.2). The anti-speculation core of the brand made visible: investor
 * return is capped (~3–4% net) and value above the cap protects affordability
 * rather than flowing to investors.
 *
 * HONESTY: this is the *published covenant policy* (docs/pilot-term-sheet.md),
 * NOT enforced in the HousingFund circuit, and it does NOT change the on-chain
 * distribution — each holder still claims their full FIFO + small-floor share.
 * Every figure here is tagged "Modelled for demo"; the panel never restates the
 * real claim as if it were reduced.
 */
export function ReturnsCapPanel({
  cappedReturnPct = CAPPED_RETURN_PCT,
  illustrationBaseEur,
  illustrationBaseLabel = "value above cost",
  variant = "full",
}: {
  cappedReturnPct?: number;
  /** Optional modelled euro base for a worked split illustration. */
  illustrationBaseEur?: number | null;
  illustrationBaseLabel?: string;
  variant?: "full" | "compact";
}) {
  const reservePct = Math.max(0, 100 - cappedReturnPct);
  // Keep the capped slice visible even though it is intentionally small.
  const investorBarPct = Math.max(6, cappedReturnPct);
  const reserveBarPct = 100 - investorBarPct;

  if (variant === "compact") {
    return (
      <div className="surface-muted flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label">Returns are capped</span>
          <ModelledChip />
        </div>
        <p className="text-caption text-text-2">
          Investor return on this project is capped at{" "}
          <span className="text-mono text-text-1">~{cappedReturnPct}% net / year</span>. Value
          above the cap is routed to an affordability reserve, the tenant, or the public
          partner — not to investors. This is the published covenant policy, not yet enforced
          in the circuit, so it does not change the on-chain share you claim.
        </p>
      </div>
    );
  }

  const split =
    typeof illustrationBaseEur === "number" && illustrationBaseEur > 0
      ? modelledReturnSplit(illustrationBaseEur, cappedReturnPct)
      : null;

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading text-text-1">Returns &amp; the affordability cap</h2>
        <ModelledChip />
      </div>
      <p className="text-caption mt-1 max-w-prose text-text-2">
        Fair Squares is supply-side, capped capital — not a yield-chasing fund. Investors earn
        up to a capped net return; everything above it protects affordability. This is what
        makes the protocol break, rather than feed, the finance↔land price loop.
      </p>

      {/* Split bar — investor cap vs. affordability reserve. */}
      <div className="mt-4 flex flex-col gap-2">
        <div
          aria-hidden="true"
          className="flex h-8 w-full overflow-hidden rounded-md border border-border"
        >
          <div
            className="flex items-center justify-center"
            style={{ width: `${investorBarPct}%`, background: "var(--color-fs-magenta)" }}
          >
            <span className="text-num px-1 text-white">{cappedReturnPct}%</span>
          </div>
          <div
            className="flex items-center justify-center"
            style={{ width: `${reserveBarPct}%`, background: "var(--color-fs-teal-dark)" }}
          >
            <span className="text-num px-1 text-white">{reservePct.toFixed(1)}%</span>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-label inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--color-fs-magenta)" }}
              />
              To investors (capped)
            </dt>
            <dd className="text-body mt-0.5 text-text-1">
              Up to <span className="text-mono">~{cappedReturnPct}% net / year</span>
              {split ? (
                <>
                  {" "}· <span className="text-mono">{formatEUR(split.investorCapEur)}</span>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-label inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--color-fs-teal-dark)" }}
              />
              To affordability (surplus)
            </dt>
            <dd className="text-body mt-0.5 text-text-1">
              Reserve · tenant · public partner
              {split ? (
                <>
                  {" "}· <span className="text-mono">{formatEUR(split.reserveEur)}</span>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
        {split ? (
          <p className="text-caption text-text-3">
            Illustrative split of {formatEUR(illustrationBaseEur as number)} of modelled{" "}
            {illustrationBaseLabel}.
          </p>
        ) : null}
      </div>

      <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">
        Published in the pilot term sheet; not yet enforced in the HousingFund circuit. The
        on-chain distribution still mints each holder their full FIFO + small-floor share —
        this panel shows the covenant a production deployment would enforce.
      </p>
    </section>
  );
}
