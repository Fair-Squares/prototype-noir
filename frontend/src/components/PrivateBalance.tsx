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
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 rounded-xl bg-card animate-pulse" />
          <div className="h-32 rounded-xl bg-card animate-pulse" />
        </div>
        <div className="h-28 rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="rounded-xl bg-card p-10 text-center text-text-3 text-sm">
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
    tokenPriceEur = 1,
    fsftMarketValue = balance,
  } = portfolio;

  return (
    <div className="space-y-4">
      {/* Primary balances */}
      <div className="grid grid-cols-2 gap-4">
        {/* EUR wallet balance */}
        <div className="rounded-xl bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-3 font-medium uppercase tracking-wide">EURs Wallet</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">EURs</span>
          </div>
          <p className="text-3xl font-bold tabular-nums">{formatEUR(eurBalance)}</p>
          <p className="text-xs text-text-3 mt-1.5">Available to deposit</p>
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-xs text-text-3">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            Private note on Aztec
          </div>
        </div>

        {/* FSFT fund balance */}
        <div className="rounded-xl bg-fs-mint p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-fs-teal-dark font-medium uppercase tracking-wide">In Fund</span>
            <span className="px-2 py-0.5 rounded-full bg-fs-teal/10 text-fs-teal-dark text-[10px] font-bold">FSFT</span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-fs-teal-dark">{formatEUR(fsftMarketValue)}</p>
          <p className="text-xs text-fs-teal-dark/60 mt-1.5">{balance.toLocaleString()} FSFT distributed after executed proposals</p>
          <div className="mt-3 pt-3 border-t border-fs-teal/10 flex items-center gap-1.5 text-xs text-fs-teal-dark/60">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            Private balance on Aztec
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">My deposit ticket</p>
          <p className="text-2xl font-bold">{formatEUR(depositedAmount)}</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">Total in housing fund</p>
          <p className="text-2xl font-bold">{formatEUR(totalFundDeposits)}</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">Allocated to assets</p>
          <p className="text-2xl font-bold">{formatEUR(totalAllocated)}</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">Fund share (FSFT)</p>
          <p className="text-2xl font-bold">{sharePercent.toFixed(2)}%</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">FSFT price</p>
          <p className="text-2xl font-bold text-fs-teal">€{tokenPriceEur.toFixed(4)}</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">Est. annual yield</p>
          <p className="text-2xl font-bold text-fs-teal">{formatEURDecimals(estimatedYield)}</p>
        </div>
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs text-text-3 font-medium uppercase tracking-wide mb-1.5">Rate</p>
          <p className="text-2xl font-bold">~3%</p>
          <p className="text-xs text-text-3 mt-0.5">per year</p>
        </div>
      </div>

      {/* Empty state CTA */}
      {balance === 0 && (
        <div className="rounded-xl bg-card p-5 border border-border text-center">
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

      {/* Privacy note */}
      <div className="rounded-xl bg-card p-4 flex gap-3 text-xs text-text-3">
        <svg className="w-4 h-4 shrink-0 text-fs-teal mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
        <span>
          Private balances are shown from your PXE when available. In this local prototype, deposit tickets and FSFT
          distribution are tracked on-chain for deterministic governance execution.
        </span>
      </div>
    </div>
  );
}
