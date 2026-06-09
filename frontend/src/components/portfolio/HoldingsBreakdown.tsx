import type { ReactNode } from "react";
import {
  AdvancedDetails,
  DataTable,
  InfoDot,
  StatusChip,
  type Column,
} from "@/components/ui";
import { formatEUR,
  formatEURDecimals, type PortfolioData } from "@/lib/contracts";

export interface HoldingsBreakdownProps {
  portfolio: PortfolioData;
  /** Claimable protocol rewards, resolved from rewards stats. */
  rewardsClaimable: number;
  rewardsSymbol: string;
}

interface HoldingRow {
  key: string;
  asset: ReactNode;
  amount: string;
  value: string;
}

/**
 * "What do I own" — a single holdings table that lists each real balance the
 * contracts expose (fund shares, cash, deposited capital, rent earnings,
 * protocol rewards) with its amount and EUR value where one exists. Locked
 * amounts and per-share / supply detail are tucked into AdvancedDetails so the
 * primary view stays calm. Every field is read from PortfolioData — nothing is
 * invented.
 */
export function HoldingsBreakdown({
  portfolio,
  rewardsClaimable,
  rewardsSymbol,
}: HoldingsBreakdownProps) {
  const fundShareSymbol = portfolio.fundTokenSymbol ?? "FSFT";
  const cashSymbol = portfolio.eurTokenSymbol ?? "EURs";
  const fsftMarketValue = portfolio.fsftMarketValue ?? 0;
  const protocolBalance = portfolio.protocolTokenBalance ?? 0;

  const rows: HoldingRow[] = [
    {
      key: "fund-shares",
      asset: (
        <div className="min-w-0">
          <p className="text-body text-text-1">Fund shares</p>
          <p className="text-caption text-text-3">{fundShareSymbol}</p>
        </div>
      ),
      amount: portfolio.balance.toLocaleString(),
      value: fsftMarketValue > 0 ? formatEUR(fsftMarketValue) : "—",
    },
    {
      key: "cash",
      asset: (
        <div className="min-w-0">
          <p className="text-body text-text-1">Cash in wallet</p>
          <p className="text-caption text-text-3">{cashSymbol}</p>
        </div>
      ),
      amount: formatEUR(portfolio.eurBalance),
      value: formatEUR(portfolio.eurBalance),
    },
    {
      key: "deposited",
      asset: (
        <div className="min-w-0">
          <p className="text-body text-text-1">Deposited capital</p>
          <p className="text-caption text-text-3">Held by the fund</p>
        </div>
      ),
      amount: formatEUR(portfolio.depositedAmount),
      value: formatEUR(portfolio.depositedAmount),
    },
    {
      key: "rent",
      asset: (
        <div className="min-w-0">
          <p className="text-body inline-flex items-center gap-1 text-text-1">
            Rent earnings
            <InfoDot
              label="What are rent earnings"
              content="Your pooled, pro-rata share of the rent the fund has collected on-chain (record_rent) across ALL its homes — not just any one. This is a separate earnings stream (your return on investment), claimable as EUR to withdraw or reinvest. It is income on top of your share value, NOT part of NAV."
            />
          </p>
          <p className="text-caption text-text-3">On-chain · separate from share value · withdraw or reinvest</p>
        </div>
      ),
      // Show the UNCLAIMED (claimable) rent here — the asset still held. Withdrawn
      // rent moves to "Cash in wallet", reinvested rent to "Deposited capital", so
      // this row never double-counts. Falls back to lifetime earned pre-ledger.
      amount: formatEUR(portfolio.rentClaimable ?? portfolio.estimatedYield),
      value: formatEUR(portfolio.rentClaimable ?? portfolio.estimatedYield),
    },
    {
      key: "rewards",
      asset: (
        <div className="min-w-0">
          <p className="text-body text-text-1">Protocol rewards</p>
          <p className="text-caption text-text-3">{rewardsSymbol}</p>
        </div>
      ),
      amount: protocolBalance.toLocaleString(),
      value: rewardsClaimable > 0 ? `${rewardsClaimable.toLocaleString()} claimable` : "—",
    },
  ];

  const columns: Column<HoldingRow>[] = [
    { key: "asset", header: "Holding" },
    { key: "amount", header: "Amount", align: "right", render: (r) => (
      <span className="text-mono text-text-1">{r.amount}</span>
    ) },
    { key: "value", header: "Value", align: "right", render: (r) => (
      <span className="text-mono text-text-2">{r.value}</span>
    ) },
  ];

  const lockedEur = portfolio.lockedEur ?? 0;
  const lockedFsft = portfolio.lockedFsft ?? 0;
  const hasLocked = lockedEur > 0 || lockedFsft > 0;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        caption="Your holdings and their value"
      />

      {hasLocked ? (
        <div className="surface-muted flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-label flex items-center gap-1.5">
              Locked
              <InfoDot
                label="What does locked mean"
                content="Funds reserved against your open trade orders. They are still yours, but are committed until the order fills, is cancelled, or expires."
              />
            </span>
            {lockedEur > 0 ? (
              <span className="text-mono text-text-1">
                {formatEUR(lockedEur)} {cashSymbol}
              </span>
            ) : null}
            {lockedFsft > 0 ? (
              <span className="text-mono text-text-1">
                {lockedFsft.toLocaleString()} {fundShareSymbol}
              </span>
            ) : null}
          </div>
          <StatusChip status="pending" label="Committed to open orders" />
        </div>
      ) : null}

      <AdvancedDetails summary="Valuation & fund detail">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {portfolio.navPerFsftEur !== undefined ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-label flex items-center gap-1.5">
                NAV per share
                <InfoDot
                  label="What is NAV per share"
                  content="Net asset value: the fund's assets divided by the number of shares outstanding. It is the reference value of one fund share, not a price target."
                />
              </dt>
              <dd className="text-body text-mono text-text-1">
                {formatEURDecimals(portfolio.navPerFsftEur)}
              </dd>
            </div>
          ) : null}
          {portfolio.tokenPriceEur !== undefined ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-label">Issue price per share</dt>
              <dd className="text-body text-mono text-text-1">
                {formatEURDecimals(portfolio.tokenPriceEur)}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <dt className="text-label">Your share of fund</dt>
            <dd className="text-body text-mono text-text-1">
              {portfolio.sharePercent.toFixed(2)}%
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-label">Total shares outstanding</dt>
            <dd className="text-body text-mono text-text-1">
              {portfolio.totalSupply.toLocaleString()} {fundShareSymbol}
            </dd>
          </div>
          {portfolio.totalFundDeposits !== undefined ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-label">Total fund deposits</dt>
              <dd className="text-body text-mono text-text-1">
                {formatEUR(portfolio.totalFundDeposits)}
              </dd>
            </div>
          ) : null}
        </dl>
      </AdvancedDetails>
    </div>
  );
}
