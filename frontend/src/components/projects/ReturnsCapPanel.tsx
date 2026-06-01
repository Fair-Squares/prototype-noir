import { ModelledChip } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";
import {
  CAPPED_RETURN_PCT,
  MODELLED_EXAMPLE_ACQUISITION_EUR,
  modelledRorRent,
} from "@/lib/projectDossier";

/**
 * D2 — capped-return display (FUTURE_DEVELOPMENT_PLAN.md §4.0, refined to the ROR
 * model — see CLAUDE.md → "Economic model"). The investor return is capped at the
 * Return on Rent (ROR), because rent is COST-BASED — rent = ROR × acquisition
 * value — and flows FULLY to investors. Affordability comes from that rent being
 * below market (the household pays less), NOT from skimming a reserve.
 *
 * HONESTY: the ROR rate is REAL when `rorOnChain` is supplied (read from
 * HousingFund.ror_bps) and is labelled "on-chain"; without it, it falls back to
 * the modelled pilot-term-sheet `CAPPED_RETURN_PCT`. The worked euro example uses
 * a modelled acquisition value and is tagged "Modelled for demo" either way. The
 * covenant policy is not enforced in-circuit and does not change the on-chain
 * claim each holder gets.
 */
export function ReturnsCapPanel({
  cappedReturnPct = CAPPED_RETURN_PCT,
  rorOnChain,
  acquisitionEur = MODELLED_EXAMPLE_ACQUISITION_EUR,
  variant = "full",
}: {
  cappedReturnPct?: number;
  /** Real ROR percent read from chain (HousingFund.ror_bps / 100). Preferred when > 0. */
  rorOnChain?: number;
  /** Acquisition value used for the worked ROR rent example (modelled). */
  acquisitionEur?: number;
  variant?: "full" | "compact";
}) {
  const onChain = typeof rorOnChain === "number" && rorOnChain > 0;
  const rorPct = onChain ? (rorOnChain as number) : cappedReturnPct;
  const rorSource = onChain ? "on-chain" : "modelled";

  if (variant === "compact") {
    return (
      <div className="surface-muted flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label">Returns are capped — rent is cost-based</span>
          {onChain ? null : <ModelledChip />}
        </div>
        <p className="text-caption text-text-2">
          Investor return is capped at{" "}
          <span className="text-mono text-text-1">~{rorPct}% / year</span> ({rorSource}) — the rent
          is set as <strong>{rorPct}% of the home&apos;s acquisition value</strong> (Return on
          Rent), paid monthly and flowing <strong>fully to investors</strong>. Because that rent is
          below market, the household gets the affordability directly — there is no reserve skim.
        </p>
      </div>
    );
  }

  const example = modelledRorRent(acquisitionEur, rorPct);

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

      {/* The ROR rate is real (on-chain) when available; the euro example is modelled. */}
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-label">Return on Rent (ROR)</dt>
          <dd className="text-body mt-0.5 text-mono text-text-1">
            ~{rorPct}% / year{" "}
            <span className="text-caption text-text-3">({rorSource})</span>
          </dd>
        </div>
        <div>
          <dt className="text-label">How rent is set</dt>
          <dd className="text-body mt-0.5 text-text-1">
            ROR × acquisition value, paid monthly, fully to investors
          </dd>
        </div>
        <div>
          <dt className="text-label">Worked example (modelled)</dt>
          <dd className="text-body mt-0.5 text-text-1">
            {formatEUR(acquisitionEur)} home →{" "}
            <span className="text-mono">{formatEUR(example.annualRentEur)}</span>/yr ·{" "}
            <span className="text-mono">{formatEUR(example.monthlyRentEur)}</span>/mo
          </dd>
        </div>
      </dl>

      <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">
        The ROR rate is {onChain ? "read from the HousingFund contract" : "the modelled pilot term sheet"};
        the worked euro figures are illustrative. The covenant is not yet enforced in-circuit — the
        on-chain distribution still mints each holder their full FIFO + small-floor share.
      </p>
    </section>
  );
}
