import { formatEUR } from "@/lib/contracts";
import type { CapitalTranche, TrancheKind } from "@/lib/projectDossier";

/** Muted, civic-finance palette per tranche role (not crypto-neon). */
const TRANCHE_COLOR: Record<TrancheKind, string> = {
  "senior-debt": "var(--color-fs-anthracite-soft)",
  subsidy: "var(--color-fs-teal-dark)",
  "member-capital": "var(--color-fs-teal-light)",
  guarantee: "var(--color-text-3)",
  "fair-squares": "var(--color-fs-magenta)",
};

/**
 * The project's capital stack as a stacked bar + a legend of tranches. The Fair
 * Squares capped-return layer (the documented financing gap / `onrendabele top`)
 * is highlighted, and its row bridges to the on-chain proposal amount so the
 * modelled stack and the real funding request are never conflated.
 *
 * All tranche figures are MODELLED — the caller wraps this in a section that
 * carries the "Modelled for demo" tag; only the on-chain bridge line is real.
 */
export function CapitalStack({
  tranches,
  totalEur,
  onChainAmountEur,
}: {
  tranches: CapitalTranche[];
  totalEur: number;
  /** The on-chain proposal amount representing the Fair Squares tranche, if known. */
  onChainAmountEur?: number | null;
}) {
  const sum = tranches.reduce((acc, t) => acc + t.amountEur, 0);
  const denom = totalEur > 0 ? totalEur : sum > 0 ? sum : 1;
  const pctOf = (amount: number) => (amount / denom) * 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Stacked bar — decorative; the legend below carries the accessible data. */}
      <div
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-full border border-border"
      >
        {tranches.map((t) => (
          <div
            key={t.key}
            title={`${t.label}: ${formatEUR(t.amountEur)} (${pctOf(t.amountEur).toFixed(0)}%)`}
            style={{ width: `${pctOf(t.amountEur)}%`, background: TRANCHE_COLOR[t.kind] }}
          />
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {tranches.map((t) => (
          <li key={t.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: TRANCHE_COLOR[t.kind] }}
                />
                <span
                  className={`text-body break-words sm:truncate ${
                    t.isFairSquares ? "font-semibold text-text-1" : "text-text-1"
                  }`}
                >
                  {t.label}
                </span>
              </span>
              <span className="text-mono flex-shrink-0 text-text-1">
                {formatEUR(t.amountEur)}
                <span className="text-caption ml-2 text-text-3">
                  {pctOf(t.amountEur).toFixed(0)}%
                </span>
              </span>
            </div>
            <p className="text-caption pl-4 text-text-2">{t.note}</p>
            {t.isFairSquares && typeof onChainAmountEur === "number" ? (
              <p className="text-caption pl-4 text-text-3">
                On this demo network this layer is represented by the on-chain funding
                request of <span className="text-mono text-text-2">{formatEUR(onChainAmountEur)}</span>.
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="text-label">Total project budget</span>
        <span className="text-mono text-text-1">{formatEUR(totalEur)}</span>
      </div>
    </div>
  );
}
