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
        setError(null);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Could not load rewards data.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [address, accountIndex]);

  const symbol = overview?.token.symbol ?? "FSP";
  const metrics = overview
    ? [
        {
          label: "Claimable",
          value: stats ? `${(stats.claimable ?? 0).toLocaleString()} ${symbol}` : "Connect wallet",
          accent: true,
        },
        { label: "Epoch", value: `${overview.currentEpoch}/${overview.token.totalEpochs}` },
        { label: "Remaining Pool", value: `${overview.remainingPool.toLocaleString()} ${symbol}` },
        {
          label: "Eligibility",
          value: stats ? (stats.eligibility.canClaimNow ? "Ready" : "Not yet") : "—",
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

      {loading && !overview ? (
        <div className="space-y-4">
          <div className="h-20 rounded-2xl bg-bg animate-pulse" />
          <div className="h-28 rounded-2xl bg-bg animate-pulse" />
        </div>
      ) : overview ? (
        <>
          <MetricRow items={metrics} />

          <section className="surface p-5">
            <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Progress</p>
            <p className="text-sm text-text-2">
              Emitted to date: <strong className="text-text-1">{overview.emittedToDate.toLocaleString()} {symbol}</strong>
            </p>
            <p className="mt-2 text-sm text-text-2">
              Next epoch: <strong className="text-text-1">{formatDateTime(overview.nextEpochAt)}</strong>
            </p>
            {!address ? (
              <p className="mt-2 text-sm text-text-3">Connect your wallet to see your personal rewards.</p>
            ) : (
              stats &&
              !stats.eligibility.canClaimNow &&
              stats.eligibility.nextSteps[0] && (
                <p className="mt-2 text-sm text-text-2">
                  Next step: <strong className="text-text-1">{stats.eligibility.nextSteps[0]}</strong>
                </p>
              )
            )}
          </section>
        </>
      ) : null}

      <ActionPanel title="What To Do Now" subtitle="Pick one">
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/portfolio"
            className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark"
          >
            Claim
          </Link>
          <Link
            href="/invest"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
          >
            Improve Eligibility
          </Link>
        </div>
        <p className="mt-3 text-xs text-text-3">
          For full reward mechanics, open{" "}
          <Link className="text-fs-teal hover:underline" href="/explain">
            Explain
          </Link>
          .
        </p>
      </ActionPanel>
    </div>
  );
}
