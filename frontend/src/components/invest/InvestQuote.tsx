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
 * Read-only quote — the trust moment before submit. Shows the deposit amount
 * (recorded as principal/NAV immediately), the NAV per share, the PROJECTED
 * FSFT shares (deposit ÷ NAV — minted later at acquisition, not at deposit),
 * and the cash that remains after the deposit. Pure presentational — figures
 * only, no inputs.
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
      info: "Your EUR moves into the housing fund now and is recorded as your principal — your claim on the fund's value (NAV). This happens immediately; it is not yet converted to shares.",
    },
    {
      label: "NAV per share",
      value: hasNav ? `€${navPerFsftEur.toFixed(4)}` : "Set at distribution",
      info: "Net Asset Value per FSFT — the fund's published value of one share.",
    },
    {
      label: "FSFT shares (projected)",
      value:
        estimatedFsft != null
          ? `~ ${estimatedFsft.toLocaleString("en-EU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })} FSFT`
          : "Issued at acquisition",
      info: "FSFT are ownership shares. They are NOT issued when you deposit — they are minted later, when the fund acquires a home through a governance vote, at the fund's NAV rate then. This figure is a projection at today's rate, not an amount issued now.",
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

      <p className="text-caption text-text-3">
        Your euros are recorded as principal (your NAV claim) as soon as you
        deposit. Ownership shares (FSFT) are issued later — when the fund next
        acquires a property through a governance vote — at the fund&rsquo;s NAV
        rate then.{" "}
        {!hasNav
          ? "No net asset value has been published yet, so the share figure can't be estimated in advance."
          : "The projection above uses today's rate; the exact amount is set at that acquisition."}
      </p>
    </div>
  );
}
