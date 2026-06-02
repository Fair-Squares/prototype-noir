import Link from "next/link";
import { StatusChip } from "@/components/ui";
import { formatEURDecimals } from "@/lib/contracts";

export interface TradeBalancesProps {
  canTrade: boolean;
  fundSymbol: string;
  eurSymbol: string;
  /** Private FSFT balance available to sell (portfolio.balance). */
  fsftBalance: number;
  /** Private EUR balance available to buy with (portfolio.eurBalance). */
  eurBalance: number;
  /** EUR locked in open commitments, if reported (portfolio.lockedEur). */
  lockedEur?: number;
  /** FSFT locked in open commitments, if reported (portfolio.lockedFsft). */
  lockedFsft?: number;
}

/**
 * Honest snapshot of the private balances that secondary trades settle over,
 * plus the eligibility gate. No invented allocations — only real portfolio
 * fields. Helps the investor see whether they need to shield first.
 */
export function TradeBalances({
  canTrade,
  fundSymbol,
  eurSymbol,
  fsftBalance,
  eurBalance,
  lockedEur,
  lockedFsft,
}: TradeBalancesProps) {
  const rows: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: `${eurSymbol} available (to buy)`,
      value: formatEURDecimals(eurBalance),
      sub: lockedEur !== undefined ? `${formatEURDecimals(lockedEur)} locked in commitments` : undefined,
    },
    {
      label: `Private ${fundSymbol} (to sell)`,
      value: `${fsftBalance.toLocaleString("en-EU")} ${fundSymbol}`,
      sub:
        lockedFsft !== undefined
          ? `${lockedFsft.toLocaleString("en-EU")} ${fundSymbol} locked in commitments`
          : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label">Eligibility</span>
        {canTrade ? (
          <StatusChip status="ready" label="Cleared to trade" />
        ) : (
          <StatusChip status="blocked" label="Not eligible" />
        )}
      </div>

      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <dt className="text-caption text-text-2">{row.label}</dt>
            <dd className="min-w-0 sm:text-right">
              <span className="text-body tabular-nums text-text-1">{row.value}</span>
              {row.sub ? <span className="text-caption block text-text-3">{row.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {canTrade ? (
        <p className="text-caption text-text-3">
          Buy orders settle over your private balance; if it&apos;s short, the public
          portion is shielded for you automatically when you place the order.
        </p>
      ) : null}

      {!canTrade ? (
        <div className="border-t border-border pt-3">
          <p className="text-caption text-text-2">
            Secondary trading requires a verified investor credential.
          </p>
          <Link href="/kyc" className="btn btn-secondary btn-sm mt-2 inline-flex">
            Verify investor status
          </Link>
        </div>
      ) : null}
    </div>
  );
}
