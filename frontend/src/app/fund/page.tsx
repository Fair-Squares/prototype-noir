"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import {
  fetchFundStats,
  fetchProperties,
  formatEUR,
  type FundStats,
  type PropertyDeed,
} from "@/lib/contracts";

export default function FundPage() {
  const [stats, setStats] = useState<FundStats | null>(null);
  const [properties, setProperties] = useState<PropertyDeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFundStats()
      .then((nextStats) => {
        if (!active) return;
        setStats(nextStats);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Could not load fund data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Property deeds are an optional, best-effort read (don't block fund stats).
    fetchProperties()
      .then((p) => {
        if (active) setProperties(p);
      })
      .catch(() => {
        if (active) setProperties([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!stats) return [];
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

      {loading ? (
        <div className="space-y-4">
          <div className="h-20 rounded-2xl bg-bg animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-32 rounded-2xl bg-bg animate-pulse" />
            <div className="h-32 rounded-2xl bg-bg animate-pulse" />
          </div>
        </div>
      ) : stats ? (
        <>
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
                <p>Data source: <strong className="text-text-1">{stats.source ?? "Live"}</strong></p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {properties.length > 0 && (
        <section className="surface p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-3">
            Real-Estate Assets (AIP-721 deeds)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {properties.map((p) => (
              <div key={p.tokenId} className="rounded-xl border border-border bg-bg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-1">Property deed #{p.tokenId}</span>
                  <span className="text-tag rounded-full bg-fs-mint px-2 py-0.5 text-fs-teal-dark">
                    {p.distributionOpen ? "Distributing" : "Held"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-2">
                  Acquired via{" "}
                  <Link href={`/governance/${p.proposalId}`} className="text-fs-teal hover:underline">
                    proposal #{p.proposalId}
                  </Link>
                </p>
                <p className="mt-1 text-sm text-text-2">
                  Valuation: <strong className="text-text-1">{formatEUR(p.valuationEur)}</strong>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-3">
            Each acquired property is recorded on-chain as a non-fungible deed held by the fund.
          </p>
        </section>
      )}

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
