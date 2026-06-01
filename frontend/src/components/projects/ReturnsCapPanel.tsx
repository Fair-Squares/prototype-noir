import { ModelledChip } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";
import {
  CAPPED_RETURN_PCT,
  MODELLED_EXAMPLE_ACQUISITION_EUR,
  modelledRorRent,
} from "@/lib/projectDossier";

/**
 * D2 — capped-return display (FUTURE_DEVELOPMENT_PLAN.md §4.0, refined to the ROR
 * model — see CLAUDE.md → "Economic model"). The anti-speculation core of the
 * brand made visible: the investor return is capped at the Return on Rent (ROR),
 * because rent is COST-BASED — rent = ROR × acquisition value — and flows FULLY
 * to investors. The affordability comes from that rent being below market (the
 * household pays less), NOT from skimming a surplus into a reserve.
 *
 * HONESTY: this is the *published covenant policy* (docs/pilot-term-sheet.md),
 * NOT enforced in the HousingFund circuit, and it does NOT change the on-chain
 * distribution — each holder still claims their full FIFO + small-floor share.
 * Every figure here is tagged "Modelled for demo".
 */
export function ReturnsCapPanel({
  cappedReturnPct = CAPPED_RETURN_PCT,
  acquisitionEur = MODELLED_EXAMPLE_ACQUISITION_EUR,
  variant = "full",
}: {
  cappedReturnPct?: number;
  /** Acquisition value used for the worked ROR rent example (modelled). */
  acquisitionEur?: number;
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <div className="surface-muted flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label">Returns are capped — rent is cost-based</span>
          <ModelledChip />
        </div>
        <p className="text-caption text-text-2">
          Investor return is capped at{" "}
          <span className="text-mono text-text-1">~{cappedReturnPct}% / year</span> — the rent is set
          as <strong>{cappedReturnPct}% of the home&apos;s acquisition value</strong> (Return on
          Rent), paid monthly and flowing <strong>fully to investors</strong>. Because that rent is
          below market, the household gets the affordability directly — there is no reserve skim.
          This is the published covenant policy, not yet enforced in the circuit, so it does not
          change the on-chain share you claim.
        </p>
      </div>
    );
  }

  const example = modelledRorRent(acquisitionEur, cappedReturnPct);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading text-text-1">Capped return — rent is cost-based</h2>
        <ModelledChip />
      </div>
      <p className="text-caption mt-1 max-w-prose text-text-2">
        Fair Squares is supply-side, capped capital — not a yield-chasing fund. The rent is defined
        off the home&apos;s acquisition cost (the Return on Rent), not the open market, and the full
        rent flows to investors. Because cost-based rent sits below market, the household — not a
        reserve — gets the affordability. This is what makes the protocol break, rather than feed,
        the finance↔land price loop.
      </p>

      {/* Worked example of the ROR formula: rent = ROR × acquisition value. */}
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-label">Return on Rent (ROR)</dt>
          <dd className="text-body mt-0.5 text-mono text-text-1">~{cappedReturnPct}% / year</dd>
        </div>
        <div>
          <dt className="text-label">How rent is set</dt>
          <dd className="text-body mt-0.5 text-text-1">
            ROR × acquisition value, paid monthly, fully to investors
          </dd>
        </div>
        <div>
          <dt className="text-label">Worked example</dt>
          <dd className="text-body mt-0.5 text-text-1">
            {formatEUR(acquisitionEur)} home →{" "}
            <span className="text-mono">{formatEUR(example.annualRentEur)}</span>/yr ·{" "}
            <span className="text-mono">{formatEUR(example.monthlyRentEur)}</span>/mo
          </dd>
        </div>
      </dl>

      <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">
        Published in the pilot term sheet; not yet enforced in the HousingFund circuit. The on-chain
        distribution still mints each holder their full FIFO + small-floor share — this panel shows
        the covenant a production deployment would enforce.
      </p>
    </section>
  );
}
