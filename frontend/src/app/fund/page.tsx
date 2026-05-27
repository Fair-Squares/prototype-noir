"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { DEMO_FUND_STATS } from "@/lib/demoData";
import { fetchFundStats, formatEUR, type FundStats } from "@/lib/contracts";

export default function FundPage() {
  const [stats, setStats] = useState<FundStats>(DEMO_FUND_STATS);
  const [usingDemoData, setUsingDemoData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFundStats()
      .then((nextStats) => {
        setStats(nextStats);
        setUsingDemoData(false);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load fund data. Showing demo snapshot.");
        setUsingDemoData(true);
      });
  }, []);

  const metrics = useMemo(() => {
    const fundValue = stats.navEur ?? Math.max(0, stats.totalDeposits + stats.totalYield);
    const sharePrice =
      stats.navPerFsftEur ?? (stats.totalSupply > 0 ? fundValue / stats.totalSupply : 0);
    return [
      { label: "Fund Value", value: formatEUR(fundValue) },
      { label: "Share Price", value: `€${sharePrice.toFixed(4)}`, accent: true },
      { label: "Available", value: formatEUR(stats.available) },
      { label: "Supply", value: stats.totalSupply.toLocaleString() },
    ];
  }, [stats]);

  return (
    <div className="space-y-6">
      <PageHero
        title="Fund"
        subtitle="Track the fund in one view."
        ctaHref="/invest"
        ctaLabel="Deposit"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {usingDemoData && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing seeded demo fund data for simulation.
        </div>
      )}

      <MetricRow items={metrics} />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="surface p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Fund Breakdown</p>
          <div className="space-y-2 text-sm text-text-2">
            <p>In DeFi: <strong className="text-text-1">{formatEUR(stats.totalInDefi)}</strong></p>
            <p>Allocated: <strong className="text-text-1">{formatEUR(stats.totalAllocated)}</strong></p>
            <p>Yield: <strong className="text-text-1">{formatEUR(stats.totalYield)}</strong></p>
          </div>
        </div>
        <div className="surface p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Health Check</p>
          <div className="space-y-2 text-sm text-text-2">
            <p>Investor count: <strong className="text-text-1">{stats.investorCount.toLocaleString()}</strong></p>
            <p>Fund status: <strong className="text-text-1">{stats.isPaused ? "Paused" : "Active"}</strong></p>
            <p>Data source: <strong className="text-text-1">{usingDemoData ? "Demo" : (stats.source ?? "Live")}</strong></p>
          </div>
        </div>
      </section>

      <ActionPanel title="What To Do Now" subtitle="Pick one">
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/invest"
            className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark"
          >
            Deposit
          </Link>
          <Link
            href="/governance"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
          >
            Vote
          </Link>
        </div>
        <p className="mt-3 text-xs text-text-3">
          Need deeper formulas and market details? Open{" "}
          <Link className="text-fs-teal hover:underline" href="/explain">
            Explain
          </Link>
          .
        </p>
      </ActionPanel>
    </div>
  );
}
