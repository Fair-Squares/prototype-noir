"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
} from "@/components/ui";
import { EligibilityPanel } from "@/components/rewards/EligibilityPanel";
import { NextSteps } from "@/components/rewards/NextSteps";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchRewardsOverview,
  fetchRewardsStats,
  type RewardsOverview,
  type RewardsStats,
} from "@/lib/contracts";

function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatToken(amount: number, symbol: string): string {
  return `${amount.toLocaleString("en-GB")} ${symbol}`;
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

    // allSettled so an unavailable per-user stats read (needs a connected
    // account / position) never blanks the public distribution schedule.
    Promise.allSettled([
      fetchRewardsOverview(),
      address ? fetchRewardsStats(address, accountIndex) : Promise.resolve(null),
    ])
      .then(([overviewRes, statsRes]) => {
        if (!mounted) return;
        if (overviewRes.status === "fulfilled") setOverview(overviewRes.value);
        if (statsRes.status === "fulfilled") setStats(statsRes.value);
        if (overviewRes.status === "rejected" && statsRes.status === "rejected") {
          const e = overviewRes.reason;
          setError(e instanceof Error ? e.message : "Could not load rewards data.");
        } else {
          setError(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [address, accountIndex]);

  const symbol = overview?.token.symbol ?? "FSP";
  const canClaim = Boolean(stats?.eligibility.canClaimNow);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Participation rewards"
        title="Rewards"
        description={
          <>
            A fixed pool of {symbol} tokens recognises long-term participation in
            Fair Squares — for holding deposits, holding property tokens, and
            voting. Rewards are released on a set schedule, not traded for yield.
            Claiming itself happens in your account.
          </>
        }
        actions={
          <Link href="/portfolio" className="btn btn-primary">
            {canClaim ? "Claim in account" : "Go to account"}
          </Link>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load rewards data">
          {error}
        </Alert>
      ) : null}

      {loading && !overview ? (
        <KpiGrid cols={4}>
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
        </KpiGrid>
      ) : overview ? (
        <KpiGrid cols={4}>
          <KpiCard
            label="Claimable now"
            tone={canClaim ? "success" : "default"}
            value={
              stats ? (
                <span className="tabular-nums">
                  {formatToken(stats.claimable, symbol)}
                </span>
              ) : (
                "Connect wallet"
              )
            }
            sub={
              stats
                ? canClaim
                  ? "Available to claim in your account"
                  : `Minimum to claim ${formatToken(stats.claimMin, symbol)}`
                : "Connect to see your position"
            }
          />
          <KpiCard
            label="Your reward balance"
            value={
              stats ? (
                <span className="tabular-nums">
                  {formatToken(stats.balance, symbol)}
                </span>
              ) : (
                "—"
              )
            }
            sub={stats ? "Claimed to date and held" : undefined}
          />
          <KpiCard
            label="Current epoch"
            value={
              <span className="tabular-nums">
                {overview.currentEpoch} / {overview.token.totalEpochs}
              </span>
            }
            sub={`Next epoch ${formatDateTime(overview.nextEpochAt)}`}
            hint={`The ${formatToken(overview.token.distributionPool, symbol)} pool releases over ${overview.token.years} years across ${overview.token.totalEpochs} epochs.`}
          />
          <KpiCard
            label="Distribution pool"
            value={
              <span className="tabular-nums">
                {formatToken(overview.remainingPool, symbol)}
              </span>
            }
            sub={`${formatToken(overview.emittedToDate, symbol)} released so far`}
          />
        </KpiGrid>
      ) : null}

      {overview ? (
        <Section
          title="Your eligibility"
          description="Rewards are weighted across three forms of participation. Each is verified privately on-chain — Fair Squares never sees the underlying position."
        >
          {!address ? (
            <EmptyState
              title="Connect your wallet to check eligibility"
              description="We can show the shared distribution schedule for everyone, but your personal claimable amount and bucket eligibility need a connected wallet."
            />
          ) : !stats ? (
            <EmptyState
              title="No rewards position yet"
              description="Once you hold a deposit or property tokens, your participation buckets and claimable amount will appear here."
              action={
                <Link href="/invest" className="btn btn-secondary">
                  Explore housing proposals
                </Link>
              }
            />
          ) : (
            <div className="space-y-6">
              <EligibilityPanel
                eligibility={stats.eligibility}
                weighting={stats.weighting}
              />

              {stats.eligibility.proofGuidance ? (
                <Alert tone="info">{stats.eligibility.proofGuidance}</Alert>
              ) : null}

              {canClaim ? (
                <Alert tone="success" title="You have rewards ready">
                  {formatToken(stats.claimable, symbol)} is ready. Claiming runs
                  from your account.{" "}
                  <Link href="/portfolio" className="underline">
                    Open your account
                  </Link>
                  .
                </Alert>
              ) : stats.eligibility.nextSteps.length > 0 ? (
                <div>
                  <p className="text-label mb-3">What to do next</p>
                  <NextSteps
                    steps={stats.eligibility.nextSteps}
                    footer={
                      <Link
                        href="/invest"
                        className="text-meta text-fs-teal-dark underline"
                      >
                        Explore housing proposals to participate
                      </Link>
                    }
                  />
                </div>
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      {overview ? (
        <Section padding="tight">
          <p className="text-meta text-text-3">
            How rewards are weighted: {overview.weighting.deposit}% for deposits,{" "}
            {overview.weighting.fsft}% for property tokens,{" "}
            {overview.weighting.governance}% for governance. Full mechanics are in{" "}
            <Link href="/explain" className="text-fs-teal-dark underline">
              Explain
            </Link>
            .
          </p>
        </Section>
      ) : null}
    </div>
  );
}
