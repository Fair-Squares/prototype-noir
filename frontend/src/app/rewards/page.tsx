"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import { fetchRewardsOverview, fetchRewardsStats, type RewardsOverview, type RewardsStats } from "@/lib/contracts";

function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "n/a";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RewardsPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [stats, setStats] = useState<RewardsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchRewardsOverview(),
      address ? fetchRewardsStats(address, accountIndex) : Promise.resolve(null),
    ])
      .then(([nextOverview, nextStats]) => {
        if (!mounted) return;
        setOverview(nextOverview);
        setStats(nextStats);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Could not load rewards data.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [address, accountIndex]);

  const metrics = overview
    ? [
        {
          label: "Claimable",
          value: `${(stats?.claimable ?? 0).toLocaleString()} ${overview.token.symbol}`,
          accent: true,
        },
        { label: "Epoch", value: `${overview.currentEpoch}/${overview.token.totalEpochs}` },
        { label: "Remaining Pool", value: `${overview.remainingPool.toLocaleString()} ${overview.token.symbol}` },
        {
          label: "Eligibility",
          value: stats?.eligibility.canClaimNow ? "Ready" : "Not yet",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHero
        title="Rewards"
        subtitle="See if you can claim now and what to improve next."
        ctaHref="/portfolio"
        ctaLabel="Claim In Account"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !overview ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <MetricRow items={metrics} />
      )}

      {overview && (
        <ActionPanel title="What To Do Now" subtitle="Pick one">
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href="/portfolio"
              className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark"
            >
              Claim
            </a>
            <a
              href="/invest"
              className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
            >
              Improve Eligibility
            </a>
          </div>
          <p className="mt-3 text-xs text-text-3">
            Next epoch: {formatDateTime(overview.nextEpochAt)}. For full reward mechanics, open{" "}
            <Link className="text-fs-teal hover:underline" href="/explain">
              Explain
            </Link>
            .
          </p>
        </ActionPanel>
      )}
    </div>
  );
}
