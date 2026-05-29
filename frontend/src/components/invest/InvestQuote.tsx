import { formatEURDecimals } from "@/lib/contracts";

export interface InvestQuoteProps {
  /** Deposit amount in EUR (already parsed; 0 when blank). */
  amountEur: number;
  /** Investor's available cash in EUR. */
  eurBalance: number;
  /** NAV per FSFT share in EUR; <= 0 means not yet established. */
  navPerFsftEur: number;
}

/**
 * Read-only quote for a pending deposit. Shows the deposit amount, the estimated
 * FSFT shares issued (amount / NAV-per-share when a NAV exists, else 1:1), the
 * current NAV per share, and the cash that remains after the deposit. Pure
 * presentational — figures only, no inputs.
 */
export function InvestQuote({ amountEur, eurBalance, navPerFsftEur }: InvestQuoteProps) {
  const hasNav = navPerFsftEur > 0;
  const estimatedFsft = hasNav ? amountEur / navPerFsftEur : amountEur;
  const remainingCash = Math.max(0, eurBalance - amountEur);

  const rows: { label: string; value: string; tone?: "accent" }[] = [
    { label: "Deposit amount", value: formatEURDecimals(amountEur), tone: "accent" },
    {
      label: "Estimated shares issued",
      value: `${estimatedFsft.toLocaleString("en-EU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })} FSFT`,
    },
    {
      label: "NAV per share",
      value: hasNav ? `€${navPerFsftEur.toFixed(4)}` : "Not yet set",
    },
    { label: "Cash after deposit", value: formatEURDecimals(remainingCash) },
  ];

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 px-4 py-3"
          >
            <dt className="text-caption text-text-2">{row.label}</dt>
            <dd
              className={`text-num text-right ${
                row.tone === "accent"
                  ? "text-fs-teal-dark font-semibold"
                  : "text-text-1"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {!hasNav ? (
        <p className="text-caption text-text-3">
          No net asset value has been established yet, so shares are estimated at
          a one-to-one rate with your deposit. The amount issued on-chain is
          settled at the fund&rsquo;s rate when your deposit is included.
        </p>
      ) : null}
    </div>
  );
}
