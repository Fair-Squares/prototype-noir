"use client";

import { formatEUR, formatEURDecimals, type PortfolioData } from "@/lib/contracts";

interface PrivateBalanceProps {
  portfolio: PortfolioData | null;
  isLoading: boolean;
}

export default function PrivateBalance({ portfolio, isLoading }: PrivateBalanceProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-36 rounded-xl bg-card animate-pulse" />
          <div className="h-36 rounded-xl bg-card animate-pulse" />
          <div className="h-36 rounded-xl bg-card animate-pulse" />
        </div>
        <div className="h-32 rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="rounded-xl bg-card p-10 text-center text-text-3 text-sm border border-border">
        Could not load portfolio data
      </div>
    );
  }

  const {
    balance,
    eurBalance,
    depositedAmount,
    sharePercent,
    estimatedYield,
    totalFundDeposits = 0,
    totalAllocated = 0,
    available = 0,
    tokenPriceEur = 0,
    navPerFsftEur = 0,
    navEur = 0,
    fsftMarketValue = 0,
    lastAssetSalePrice = 0,
    lastFsftMinted = 0,
    protocolTokenBalance = 0,
    protocolTokenSymbol = "FSP",
    rewardsClaimable = 0,
    lockedEur = 0,
    lockedFsft = 0,
  } = portfolio;

  return (
    <div className="space-y-4">
      <section className="surface overflow-hidden">
        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-text-3 font-medium uppercase tracking-wide">EURs Wallet</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">EURs</span>
            </div>
            <p className="text-3xl leading-none tabular-nums">{formatEUR(eurBalance)}</p>
            <p className="text-xs text-text-3 mt-2">Available to deposit</p>
            <p className="text-xs text-text-3 mt-3 pt-3 border-t border-border">Wallet balance</p>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-text-3 font-medium uppercase tracking-wide">Deposit position</span>
              <span className="px-2 py-0.5 rounded-full bg-fs-mint text-fs-teal-dark text-[10px] font-bold">Fund</span>
            </div>
            <p className="text-3xl leading-none tabular-nums">{formatEUR(depositedAmount)}</p>
            <p className="text-xs text-text-3 mt-2">Your deposited EURs in the fund</p>
            <p className="text-xs text-text-3 mt-3 pt-3 border-t border-border">Fund position</p>
          </div>

          <div className="p-6 bg-fs-mint/45">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-fs-teal-dark font-medium uppercase tracking-wide">In Fund</span>
              <span className="px-2 py-0.5 rounded-full bg-fs-teal/10 text-fs-teal-dark text-[10px] font-bold">FSFT</span>
            </div>
            <p className="text-3xl leading-none tabular-nums text-fs-teal-dark">{formatEUR(fsftMarketValue)}</p>
            <p className="text-xs text-fs-teal-dark/70 mt-2">{balance.toLocaleString()} FSFT held • valued at estimated share price</p>
            <p className="text-xs text-fs-teal-dark/70 mt-3 pt-3 border-t border-fs-teal/15">FSFT holdings</p>
          </div>
        </div>
      </section>

      <section className="surface p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-1">Fund snapshot</h3>
          <span className="text-[11px] text-text-3">Private portfolio overview</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1">Total in housing fund</p>
            <p className="text-xl leading-none">{formatEUR(totalFundDeposits)}</p>
          </div>
          <div>
            <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1">Allocated to assets</p>
            <p className="text-xl leading-none">{formatEUR(totalAllocated)}</p>
          </div>
          <div>
            <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1">Available</p>
            <p className="text-xl leading-none">{formatEUR(available)}</p>
          </div>
          <div>
            <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1">Fund share (FSFT)</p>
            <p className="text-xl leading-none">{sharePercent.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1">Estimated share price</p>
            <p className="text-xl leading-none text-fs-teal">€{navPerFsftEur.toFixed(4)}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-text-3 text-xs uppercase tracking-wide mb-1">Last asset sale price</p>
            <p className="font-semibold">{formatEUR(lastAssetSalePrice)}</p>
          </div>
          <div>
            <p className="text-text-3 text-xs uppercase tracking-wide mb-1">Last FSFT minted</p>
            <p className="font-semibold">{lastFsftMinted.toLocaleString()} FSFT</p>
          </div>
          <div>
            <p className="text-text-3 text-xs uppercase tracking-wide mb-1">Issue price reference</p>
            <p className="font-semibold text-fs-teal">{tokenPriceEur > 0 ? `€${tokenPriceEur.toFixed(4)}` : "n/a"}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-2">
          Locked for active DEX orders: {formatEURDecimals(lockedEur)} EUR • {lockedFsft.toLocaleString()} FSFT
        </div>
        <div className="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-2">
          Protocol distribution balance: {protocolTokenBalance.toLocaleString()} {protocolTokenSymbol}
          {" • "}claimable now: {rewardsClaimable.toLocaleString()} {protocolTokenSymbol}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-2">
          FSFT tracks your share of the fund. Current fund value: {formatEUR(navEur)}.
        </div>

        {balance === 0 && (
          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-sm text-text-2 mb-2">
              You have <strong>{formatEUR(eurBalance)}</strong> EURs available to invest
            </p>
            <a
              href="/invest"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-fs-teal hover:text-fs-teal-dark"
            >
              Start investing in affordable housing →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
