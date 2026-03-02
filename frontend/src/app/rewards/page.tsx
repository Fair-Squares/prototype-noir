"use client";

import { useEffect, useMemo, useState } from "react";
import SimulationModeBadge from "@/components/SimulationModeBadge";
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
      .catch((e) => {
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
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-2">
          <SimulationModeBadge />
        </div>
        <h1 className="text-2xl mb-1">FSP Distribution</h1>
        <p className="text-sm text-text-2">
          Track protocol token emissions, monthly progress, and what makes an account eligible.
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !overview || !progress ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Distribution pool</p>
              <p className="text-3xl font-semibold">{overview.token.distributionPool.toLocaleString()} FSP</p>
              <p className="text-xs text-text-3 mt-2">Out of 10,000,000 total supply.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Current epoch</p>
              <p className="text-3xl font-semibold">{overview.currentEpoch}/{overview.token.totalEpochs}</p>
              <p className="text-xs text-text-3 mt-2">Next epoch: {formatDateTime(overview.nextEpochAt)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Claim minimum</p>
              <p className="text-3xl font-semibold">{overview.claimMin.toLocaleString()} FSP</p>
              <p className="text-xs text-text-3 mt-2">Claims below this amount are deferred.</p>
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold mb-3">Where distribution stands</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex items-center justify-between text-xs text-text-3 mb-1">
                    <span>Emitted from pool</span>
                    <span>{progress.emittedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg border border-border overflow-hidden">
                    <div className="h-full bg-fs-teal" style={{ width: `${progress.emittedPct}%` }} />
                  </div>
                  <p className="text-xs text-text-3 mt-1">
                    {overview.emittedToDate.toLocaleString()} emitted • {overview.remainingPool.toLocaleString()} remaining
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-text-3 mb-1">
                    <span>Claimed from emitted</span>
                    <span>{progress.claimedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg border border-border overflow-hidden">
                    <div className="h-full bg-fs-magenta" style={{ width: `${progress.claimedPct}%` }} />
                  </div>
                  <p className="text-xs text-text-3 mt-1">{overview.totalClaimed.toLocaleString()} claimed so far</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                Allocation per epoch: {overview.weighting.deposit}% deposits, {overview.weighting.fsft}% FSFT,
                {" "}{overview.weighting.governance}% governance participation.
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold mb-3">Why this is spread over 10 years</h2>
              <div className="space-y-2 text-sm text-text-2">
                <p>1. Rewards stay aligned with long-term participation, not short-term farming.</p>
                <p>2. Emissions are predictable, so new users can still participate later.</p>
                <p>3. Gradual release lowers supply shock and keeps governance incentives steady.</p>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                Privacy model: eligibility is checked from contract state while your private holdings stay private.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-3">10-year emission curve</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
              {overview.yearlySchedule.map((year) => (
                <div key={year.year} className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 uppercase tracking-wide">Year {year.year}</p>
                  <p className="text-lg font-semibold mt-1">{year.percent}%</p>
                  <p className="text-xs text-text-3 mt-1">{year.tokens.toLocaleString()} FSP</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-3">How the private FSFT check works</h2>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">1. Verify privately</p>
                <p className="text-text-3">Aztec checks that your wallet has private FSFT.</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">2. Store minimal result</p>
                <p className="text-text-3">Only a boolean eligibility flag is stored on-chain.</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">3. Keep balances private</p>
                <p className="text-text-3">Your private FSFT amount is not disclosed by this proof.</p>
              </div>
            </div>
          </section>

          {stats && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold mb-3">Your eligibility status</h2>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="font-semibold text-text-1">Deposit bucket</p>
                  <p className="text-xs text-text-3 mt-1">
                    {stats.eligibility.depositBucketEligible ? "Eligible" : "Not eligible yet"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="font-semibold text-text-1">FSFT bucket</p>
                  <p className="text-xs text-text-3 mt-1">
                    {stats.eligibility.fsftBucketEligible ? "Eligible" : "Not eligible yet"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="font-semibold text-text-1">Governance bucket</p>
                  <p className="text-xs text-text-3 mt-1">{stats.eligibility.governanceBucketHint}</p>
                </div>
              </div>
              {stats.eligibility.nextSteps.length > 0 && (
                <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                  Next step: {stats.eligibility.nextSteps[0]}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!stats.eligibility.depositBucketEligible && (
                  <a href="/invest" className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-bg">
                    Add deposit
                  </a>
                )}
                {!stats.eligibility.fsftBucketEligible && (
                  <a href="/dex" className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-bg">
                    Hold FSFT
                  </a>
                )}
                <a href="/governance" className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-bg">
                  Vote on proposals
                </a>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-bg px-4 py-3 text-xs text-text-2">
            Proof and privacy model: account eligibility is verified against Aztec contract state while private balances stay private.
          </section>
        </>
      )}
    </div>
  );
}
