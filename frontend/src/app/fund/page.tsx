"use client";

import { useEffect, useMemo, useState } from "react";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  PROPOSAL_STATUS,
  fetchDexOrderbook,
  fetchFundStats,
  fetchPortfolio,
  fetchProposals,
  formatEUR,
  formatEURDecimals,
  type DexOrderbook,
  type FundStats,
  type PortfolioData,
  type Proposal,
} from "@/lib/contracts";

export default function FundPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? undefined;
  const accountIndex = activeAccount?.index ?? 0;

  const [stats, setStats] = useState<FundStats | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [orderbook, setOrderbook] = useState<DexOrderbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchFundStats(),
      fetchProposals(address, accountIndex),
      fetchDexOrderbook(address),
      address ? fetchPortfolio(address, accountIndex) : Promise.resolve(null),
    ])
      .then(([nextStats, nextProposals, nextOrderbook, nextPortfolio]) => {
        if (!mounted) return;
        setStats(nextStats);
        setProposals(nextProposals);
        setOrderbook(nextOrderbook);
        setPortfolio(nextPortfolio);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Could not load fund data.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [address, accountIndex]);

  const metrics = useMemo(() => {
    if (!stats) return null;
    const fundValue = stats.navEur ?? Math.max(0, stats.totalDeposits + stats.totalYield);
    const supply = Math.max(0, stats.totalSupply);
    const estimatedSharePrice = stats.navPerFsftEur ?? (supply > 0 ? fundValue / supply : 0);
    return { fundValue, supply, estimatedSharePrice };
  }, [stats]);

  const distribution = useMemo(() => {
    const opened = proposals.filter((p) => p.distributionOpened);
    const totalAmount = opened.reduce((sum, p) => sum + (p.distributionAmount ?? 0), 0);
    const totalClaimed = opened.reduce((sum, p) => sum + (p.distributionClaimed ?? 0), 0);
    return { totalAmount, totalClaimed };
  }, [proposals]);

  const recentProposals = [...proposals].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentTrades = orderbook?.recentTrades?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="Housing Fund"
        subtitle="Simple view: track fund value, FSFT share price, and what to do next."
        ctaHref="/invest"
        ctaLabel="Deposit EUR"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !stats || !metrics ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
          <div className="h-28 rounded-xl bg-card animate-pulse" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PrimaryCard
              title="Estimated FSFT Price"
              value={`€${metrics.estimatedSharePrice.toFixed(4)}`}
              hint="Current estimated share price"
              accent
            />
            <PrimaryCard
              title="Fund Value"
              value={formatEUR(metrics.fundValue)}
              hint="Deposits plus earned return"
            />
            <PrimaryCard
              title="FSFT In Circulation"
              value={metrics.supply.toLocaleString()}
              hint="Distributed after executed proposals"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">How Price Is Calculated</p>
              <h2 className="text-lg font-semibold mb-2">Fund value / FSFT supply</h2>
              <p className="text-sm text-text-2">
                {formatEUR(metrics.fundValue)} / {metrics.supply.toLocaleString()} = {" "}
                <strong>€{metrics.estimatedSharePrice.toFixed(4)}</strong>
              </p>
              <p className="text-xs text-text-3 mt-3">
                Eligibility checks use private proofs. Your private balances are not exposed in this view.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Your Next Step</p>
              <h2 className="text-lg font-semibold mb-3">Pick one action</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href="/invest" className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark">Deposit EUR</a>
                <a href="/governance" className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1">Vote on Proposals</a>
                <a href="/dex" className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1">Trade FSFT</a>
                <a href="/rewards" className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1">Check Rewards</a>
              </div>
              {portfolio && (
                <p className="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-2">
                  Your current share: <strong>{portfolio.sharePercent.toFixed(2)}%</strong> ({portfolio.balance.toLocaleString()} FSFT)
                </p>
              )}
            </div>
          </section>

          <AdvancedDetails summary="Advanced fund activity and market details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-text-3">Total deposits</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalDeposits)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-text-3">Earning now</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalInDefi)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-text-3">Reserved</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalAllocated)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-text-3">Available</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.available)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                Distribution claimed: {distribution.totalClaimed.toLocaleString()} / {distribution.totalAmount.toLocaleString()} FSFT
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-sm font-semibold mb-2">Recent proposal activity</p>
                  {recentProposals.length === 0 ? (
                    <p className="text-xs text-text-3">No proposal activity yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentProposals.map((proposal) => (
                        <div key={proposal.id} className="rounded-md border border-border bg-white p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-text-1 truncate">{proposal.title}</p>
                            <span className="text-text-3">{PROPOSAL_STATUS[proposal.status] ?? "Unknown"}</span>
                          </div>
                          <p className="text-text-3 mt-1">
                            Budget {formatEUR(proposal.amount)} • votes {proposal.yesVotes}/{proposal.noVotes}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-sm font-semibold mb-2">Recent FSFT trades</p>
                  {recentTrades.length === 0 ? (
                    <p className="text-xs text-text-3">No recent trades yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentTrades.map((trade) => (
                        <div key={trade.id} className="rounded-md border border-border bg-white p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-text-1">
                              {trade.amount.toLocaleString()} FSFT at {formatEURDecimals(trade.priceEur)}
                            </p>
                            <span className="text-text-3">#{trade.id}</span>
                          </div>
                          <p className="text-text-3 mt-1">
                            Buyer …{trade.buyer.slice(-6)} • Seller …{trade.seller.slice(-6)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </AdvancedDetails>
        </>
      )}
    </div>
  );
}
