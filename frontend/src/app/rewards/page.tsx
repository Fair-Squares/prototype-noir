"use client";

import { useEffect, useMemo, useState } from "react";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
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

  const progress = useMemo(() => {
    if (!overview) return null;
    const emittedPct = overview.token.distributionPool > 0
      ? Math.min(100, (overview.emittedToDate / overview.token.distributionPool) * 100)
      : 0;
    const claimedPct = overview.emittedToDate > 0
      ? Math.min(100, (overview.totalClaimed / overview.emittedToDate) * 100)
      : 0;
    return { emittedPct, claimedPct };
  }, [overview]);

  return (
    <div className="space-y-6">
      <PageHero
        title="FSP Rewards"
        subtitle="Simple view of emissions, your eligibility, and what to do next."
        ctaHref="/portfolio"
        ctaLabel="Open My Account"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !overview || !progress ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PrimaryCard
              title="Claimable Now"
              value={`${(stats?.claimable ?? 0).toLocaleString()} ${overview.token.symbol}`}
              hint={`Minimum claim ${overview.claimMin.toLocaleString()} ${overview.token.symbol}`}
              accent
            />
            <PrimaryCard
              title="Current Epoch"
              value={`${overview.currentEpoch}/${overview.token.totalEpochs}`}
              hint={`Next epoch ${formatDateTime(overview.nextEpochAt)}`}
            />
            <PrimaryCard
              title="Remaining Pool"
              value={`${overview.remainingPool.toLocaleString()} ${overview.token.symbol}`}
              hint="Undistributed rewards"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Your Next Step</p>
              <h2 className="text-lg font-semibold mb-3">Become fully eligible</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                  <span>Deposit bucket</span>
                  <span className={stats?.eligibility.depositBucketEligible ? "text-fs-teal font-semibold" : "text-text-2"}>
                    {stats?.eligibility.depositBucketEligible ? "Eligible" : "Not yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                  <span>FSFT bucket</span>
                  <span className={stats?.eligibility.fsftBucketEligible ? "text-fs-teal font-semibold" : "text-text-2"}>
                    {stats?.eligibility.fsftBucketEligible ? "Eligible" : "Not yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                  <span>Governance bucket</span>
                  <span className={stats?.eligibility.governanceBucketHint ? "text-text-1" : "text-text-2"}>
                    {stats?.eligibility.governanceBucketHint ?? "Vote to qualify"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-3 mt-3">
                {stats?.eligibility.nextSteps[0] ?? "Use portfolio actions to complete eligibility checks and claim."}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Distribution Progress</p>
              <h2 className="text-lg font-semibold mb-3">Where we are today</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex items-center justify-between text-xs text-text-3 mb-1">
                    <span>Emitted from pool</span>
                    <span>{progress.emittedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-border bg-bg">
                    <div className="h-full bg-fs-teal" style={{ width: `${progress.emittedPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-text-3 mb-1">
                    <span>Claimed from emitted</span>
                    <span>{progress.claimedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-border bg-bg">
                    <div className="h-full bg-fs-magenta" style={{ width: `${progress.claimedPct}%` }} />
                  </div>
                </div>
                <p className="text-xs text-text-3">
                  Allocation per epoch: {overview.weighting.deposit}% deposits, {overview.weighting.fsft}% FSFT,
                  {" "}{overview.weighting.governance}% governance.
                </p>
              </div>
            </div>
          </section>

          <AdvancedDetails summary="Advanced reward mechanics">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                {overview.yearlySchedule.map((year) => (
                  <div key={year.year} className="rounded-lg border border-border bg-bg p-3">
                    <p className="text-xs uppercase tracking-wide text-text-3">Year {year.year}</p>
                    <p className="text-lg font-semibold mt-1">{year.percent}%</p>
                    <p className="text-xs text-text-3 mt-1">{year.tokens.toLocaleString()} {overview.token.symbol}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                Privacy model: rewards eligibility is checked against contract state while private balances remain private.
              </div>
            </div>
          </AdvancedDetails>
        </>
      )}
    </div>
  );
}
