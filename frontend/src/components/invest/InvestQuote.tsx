import type { ReactNode } from "react";
import { InfoDot } from "@/components/ui";
import { formatEURDecimals } from "@/lib/contracts";

export interface InvestQuoteProps {
  /** Deposit amount in EUR (already parsed; 0 when blank). */
  amountEur: number;
  /** Investor's available cash in EUR. */
  eurBalance: number;
  /** NAV per FSFT share in EUR; <= 0 means not yet established. */
  navPerFsftEur: number;
}

interface QuoteRow {
  label: string;
  value: string;
  info?: ReactNode;
  tone?: "accent";
}

/**
 * Read-only quote — the trust moment before submit. Shows the deposit amount,
 * the NAV per share, the estimated FSFT shares issued (deposit ÷ NAV when a NAV
 * is published, otherwise "Set at distribution"), and the cash that remains
 * after the deposit. Pure presentational — figures only, no inputs.
 *
 * No capped-return or fee rows: there is no contract source for them, so they
 * are omitted rather than invented.
 */
export function InvestQuote({ amountEur, eurBalance, navPerFsftEur }: InvestQuoteProps) {
  const hasNav = navPerFsftEur > 0;
  // FSFT issued estimate: deposit ÷ NAV only when a NAV is actually published.
  const estimatedFsft = hasNav ? amountEur / navPerFsftEur : null;
  const remainingCash = Math.max(0, eurBalance - amountEur);

  const rows: QuoteRow[] = [
    {
      label: "You deposit",
      value: formatEURDecimals(amountEur),
      tone: "accent",
      info: "The EUR moved from your wallet into the housing fund toward financing affordable homes.",
    },
    {
      label: "NAV per share",
      value: hasNav ? `€${navPerFsftEur.toFixed(4)}` : "Set at distribution",
      info: "Net Asset Value per FSFT — the fund's published value of one share.",
    },
    {
      label: "FSFT issued (estimate)",
      value:
        estimatedFsft != null
          ? `~ ${estimatedFsft.toLocaleString("en-EU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })} FSFT`
          : "Set at distribution",
      info: "FSFT are your ownership shares in the fund. The exact amount is issued when the fund distributes, at the fund's rate at that time.",
    },
    {
      label: "Cash after deposit",
      value: formatEURDecimals(remainingCash),
    },
  ];

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
          >
            <dt className="text-caption flex items-center gap-1.5 text-text-2">
              <span>{row.label}</span>
              {row.info ? <InfoDot label={`About ${row.label}`} content={row.info} /> : null}
            </dt>
            <dd
              className={`text-num min-w-0 break-words sm:text-right ${
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
          No net asset value has been published yet, so shares cannot be
          estimated in advance. The amount of FSFT you receive is settled at the
          fund&rsquo;s rate when the fund distributes.
        </p>
      ) : null}
    </div>
  );
}
