"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { fetchFundStats, formatEUR, type FundStats } from "@/lib/contracts";

export default function DashboardPage() {
  const [stats, setStats] = useState<FundStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFundStats()
      .then(setStats)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load fund data.");
      });
  }, []);

  const metrics = useMemo(() => {
    if (!stats) return null;
    const fundValue = stats.navEur ?? Math.max(0, stats.totalDeposits + stats.totalYield);
    const sharePrice =
      stats.navPerFsftEur ?? (stats.totalSupply > 0 ? fundValue / stats.totalSupply : 0);
    return [
      { label: "Fund Value", value: formatEUR(fundValue) },
      { label: "Share Price", value: `€${sharePrice.toFixed(4)}`, accent: true },
      { label: "Available Cash", value: formatEUR(stats.available) },
      { label: "Investors", value: stats.investorCount.toLocaleString() },
    ];
  }, [stats]);

  return (
    <div className="space-y-6">
      <PageHero
        title="Fair Squares"
        subtitle="Simple housing investment app. Start with one action."
        ctaHref="/invest"
        ctaLabel="Deposit"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!metrics ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <MetricRow items={metrics} />
      )}

      <ActionPanel title="What To Do Now" subtitle="Pick one">
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href="/invest"
            className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark"
          >
            Deposit
          </a>
          <a
            href="/portfolio"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
          >
            Open Account
          </a>
        </div>
        <div className="mt-3 flex gap-3 text-xs">
          <Link className="text-fs-teal hover:underline" href="/governance">
            Quick link: Vote
          </Link>
          <Link className="text-fs-teal hover:underline" href="/dex">
            Quick link: Trade
          </Link>
          <Link className="text-fs-teal hover:underline" href="/explain">
            Explain This App
          </Link>
        </div>
      </ActionPanel>
    </div>
  );
}
