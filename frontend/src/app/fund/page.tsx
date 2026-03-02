"use client";

import { useEffect, useMemo, useState } from "react";
import SimulationModeBadge from "@/components/SimulationModeBadge";
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
      .catch((e) => {
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
    return {
      fundValue,
      supply,
      estimatedSharePrice,
    };
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
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-2">
          <SimulationModeBadge />
        </div>
        <h1 className="text-2xl mb-1">Housing Fund</h1>
        <p className="text-sm text-text-2">
          See how the estimated FSFT share price is formed and what activity is driving it.
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !stats || !metrics ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-32 rounded-xl bg-card animate-pulse" />
          <div className="h-32 rounded-xl bg-card animate-pulse" />
          <div className="h-32 rounded-xl bg-card animate-pulse" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Estimated share price</p>
              <p className="text-3xl text-fs-teal font-semibold">€{metrics.estimatedSharePrice.toFixed(4)}</p>
              <p className="text-xs text-text-3 mt-2">
                Fund value {formatEUR(metrics.fundValue)} divided by {metrics.supply.toLocaleString()} FSFT.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Fund value</p>
              <p className="text-3xl font-semibold">{formatEUR(metrics.fundValue)}</p>
              <p className="text-xs text-text-3 mt-2">Total deposits + earned return.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">FSFT in circulation</p>
              <p className="text-3xl font-semibold">{metrics.supply.toLocaleString()}</p>
              <p className="text-xs text-text-3 mt-2">FSFT is distributed after proposals are executed.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-3">How the FSFT price is formed</h2>
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-2">
              <p className="font-semibold text-text-1 mb-2">Formula</p>
              <p>
                <strong>Estimated FSFT price</strong> = <strong>Total fund value</strong> /{" "}
                <strong>FSFT in circulation</strong>
              </p>
              <p className="mt-2 text-xs">
                Right now: {formatEUR(metrics.fundValue)} / {metrics.supply.toLocaleString()} ={" "}
                €{metrics.estimatedSharePrice.toFixed(4)}
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3 text-xs">
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">What can move it up</p>
                <p className="text-text-3">More fund value from deposits or yield while supply stays stable.</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">What can move it down</p>
                <p className="text-text-3">Lower fund value or faster FSFT growth than fund value growth.</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <p className="font-semibold text-text-1 mb-1">Why this is transparent</p>
                <p className="text-text-3">The values are read from Aztec contracts (or simulation mirror).</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
              Trust model: NAV inputs (fund totals and FSFT supply) are public contract values. Private FSFT holder proofs are separate and only used for eligibility checks without exposing balances.
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold mb-3">Fund activity</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 uppercase tracking-wide">Total deposits</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalDeposits)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 uppercase tracking-wide">Earning now</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalInDefi)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 uppercase tracking-wide">Reserved</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.totalAllocated)}</p>
                </div>
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 uppercase tracking-wide">Available</p>
                  <p className="font-semibold mt-1">{formatEUR(stats.available)}</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
                Distribution opened from executed proposals: {distribution.totalClaimed.toLocaleString()} /{" "}
                {distribution.totalAmount.toLocaleString()} FSFT claimed.
              </div>
              {portfolio && (
                <div className="mt-3 rounded-lg border border-border bg-fs-mint/40 p-3 text-xs text-fs-teal-dark">
                  Your current fund share: {portfolio.sharePercent.toFixed(2)}% ({portfolio.balance.toLocaleString()} FSFT)
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold mb-3">Recent proposal activity</h2>
              <div className="space-y-2">
                {recentProposals.length === 0 ? (
                  <p className="text-sm text-text-3">No proposal activity yet.</p>
                ) : (
                  recentProposals.map((proposal) => (
                    <div key={proposal.id} className="rounded-lg border border-border bg-bg p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-text-1 truncate">{proposal.title}</p>
                        <span className="text-xs text-text-3">{PROPOSAL_STATUS[proposal.status] ?? "Unknown"}</span>
                      </div>
                      <p className="text-xs text-text-3 mt-1">
                        Budget {formatEUR(proposal.amount)} • votes {proposal.yesVotes}/{proposal.noVotes}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-3">Recent FSFT trades</h2>
            <div className="space-y-2">
              {recentTrades.length === 0 ? (
                <p className="text-sm text-text-3">No recent trades yet.</p>
              ) : (
                recentTrades.map((trade) => (
                  <div key={trade.id} className="rounded-lg border border-border bg-bg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text-1">
                        {trade.amount.toLocaleString()} FSFT at {formatEURDecimals(trade.priceEur)}
                      </p>
                      <span className="text-xs text-text-3">Trade #{trade.id}</span>
                    </div>
                    <p className="text-xs text-text-3 mt-1">
                      Buyer …{trade.buyer.slice(-6)} • Seller …{trade.seller.slice(-6)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
