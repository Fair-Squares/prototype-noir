import type { ReactNode } from "react";
import { InfoDot } from "@/components/ui";
import { formatEURDecimals } from "@/lib/contracts";

export interface InvestQuoteProps {
  /** Deposit amount in EUR (already parsed; 0 when blank). */
  amountEur: number;
  /** Investor's available cash in EUR. */
  eurBalance: number;
  /** EUR price of one share at purchase; null before the fund's first home. */
  sharePriceEur: number | null;
}

interface QuoteRow {
  label: string;
  value: string;
  info?: ReactNode;
  tone?: "accent";
}

/**
 * Read-only quote — the trust moment before submit. Shows the deposit amount
 * (recorded as principal immediately), the price per share at purchase, the
 * most shares the deposit could become (deposit ÷ price — minted later, only
 * for the part the fund spends on a home), and the cash that remains after the
 * deposit. Pure presentational — figures only, no inputs.
 *
 * No capped-return or fee rows: there is no contract source for them, so they
 * are omitted rather than invented.
 */
export function InvestQuote({ amountEur, eurBalance, sharePriceEur }: InvestQuoteProps) {
  // Upper bound on shares: deposit ÷ purchase price, only once a price exists.
  const maxFsft = sharePriceEur != null && sharePriceEur > 0 ? amountEur / sharePriceEur : null;
  const remainingCash = Math.max(0, eurBalance - amountEur);

  const rows: QuoteRow[] = [
    {
      label: "You deposit",
      value: formatEURDecimals(amountEur),
      tone: "accent",
      info: "Your EUR moves into the housing fund now and is recorded as your principal. This happens immediately; it is not yet converted to shares.",
    },
    {
      label: "Price per share",
      value: sharePriceEur != null ? formatEURDecimals(sharePriceEur) : "Set at the first home",
      info: "Shares are issued at the price the fund pays for a home, and valued at that price until the homes are revalued.",
    },
    {
      label: "FSFT shares (at most)",
      value:
        maxFsft != null
          ? `up to ${maxFsft.toLocaleString("en-EU", {
              maximumFractionDigits: 2,
            })} FSFT`
          : "Issued when a home is bought",
      info: "FSFT are ownership shares. They are NOT issued when you deposit — they are minted when the fund buys a home through a vote, for your pro-rata part of the purchase. Money not yet used for a home stays your deposit, so you receive this many shares only once all of it has gone into homes.",
    },
    {
      label: "Cash after deposit",
      value: formatEURDecimals(remainingCash),
    },
    {
      label: "Privacy",
      value: "Your position stays private",
      info: "Only you can see your deposit and balance. The fund publishes aggregates — totals and counts — never who invested what.",
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

      {/* §4.3: the outcome row — the user signs off on the goal, not just the
          amount. Deposits are pooled (never attributed to one project), so the
          framing stays fund-wide and honest. */}
      <p className="text-caption text-text-2">
        <span className="font-semibold text-text-1">What it makes possible:</span>{" "}
        your deposit pools with other investors&rsquo; to finance affordable
        homes whose rents are capped below market — that, plus the capped
        return, is the deal you&rsquo;re confirming.
      </p>

      <p className="text-caption text-text-3">
        Your euros are recorded as principal as soon as you deposit. Ownership
        shares (FSFT) are issued later — when the fund buys a home through a
        vote — for your part of that purchase, at the price paid.{" "}
        {maxFsft == null
          ? "No home has been bought yet, so there is no share price to estimate with."
          : "The figure above uses today's price; the exact amount is set at each purchase."}
      </p>
    </div>
  );
}
