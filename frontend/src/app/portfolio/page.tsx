"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForRewards,
  claimRewards,
  fetchKYCProfile,
  fetchPortfolio,
  fetchRewardsStats,
  formatEUR,
  type KYCProfile,
  type PortfolioData,
  type RewardsStats,
} from "@/lib/contracts";

export default function PortfolioPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile>({
    verified: false,
    isInvestor: false,
    roles: [],
  });
  const [rewards, setRewards] = useState<RewardsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAccountData = async (addr: string) => {
    setLoading(true);
    try {
      const [nextPortfolio, nextProfile, nextRewards] = await Promise.all([
        fetchPortfolio(addr, accountIndex),
        fetchKYCProfile(addr),
        fetchRewardsStats(addr, accountIndex),
      ]);
      setPortfolio(nextPortfolio);
      setKycProfile(nextProfile);
      setRewards(nextRewards);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load account data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!address) {
      setPortfolio(null);
      setRewards(null);
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      return;
    }
    loadAccountData(address);
  }, [address, accountIndex]);

  const handleClaimRewards = async () => {
    if (!address) return;
    const result = await claimRewards(address, accountIndex);
    if (!result.success) {
      setMessage(result.error ?? "Claim failed.");
      return;
    }
    setMessage(`Claimed ${(result.claimed ?? 0).toLocaleString()} ${rewards?.token.symbol ?? "FSP"}.`);
    await loadAccountData(address);
  };

  const handleAttestRewards = async () => {
    if (!address) return;
    const result = await attestFsftForRewards(address, accountIndex);
    if (!result.success) {
      setMessage(result.error ?? "Private check failed.");
      return;
    }
    setMessage("Private Fund Shares check completed.");
    await loadAccountData(address);
  };

  if (!address) {
    return (
      <div className="space-y-6">
        <PageHero
          title="Account"
          subtitle="Connect your wallet to see your balances."
          ctaHref="/invest"
          ctaLabel="Deposit"
        />
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-text-3">
          Connect your wallet from the top-right account button.
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Cash (EURs)", value: formatEUR(portfolio?.eurBalance ?? 0) },
    { label: "Fund Shares (FSFT)", value: (portfolio?.balance ?? 0).toLocaleString() },
    { label: "Deposited", value: formatEUR(portfolio?.depositedAmount ?? 0) },
    {
      label: "Rewards (FSP)",
      value: (rewards?.claimable ?? 0).toLocaleString(),
      accent: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHero
        title="Account"
        subtitle="Your balances and next actions."
        ctaHref="/invest"
        ctaLabel="Deposit"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/10 px-4 py-3 text-sm text-fs-teal-dark">
          {message}
        </div>
      )}

      <MetricRow items={metrics} />

      <ActionPanel title="What To Do Now" subtitle="Pick one">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={handleClaimRewards}
            disabled={loading || !rewards?.eligibility?.canClaimNow}
            className="rounded-lg bg-fs-teal px-3 py-2 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
          >
            Claim Rewards
          </button>
          <a
            href="/invest"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
          >
            Deposit
          </a>
        </div>
        <div className="mt-3 flex gap-3 text-xs">
          <button
            onClick={handleAttestRewards}
            disabled={loading}
            className="text-fs-teal hover:underline disabled:opacity-50"
          >
            Run private Fund Shares check
          </button>
          {!kycProfile.isInvestor && (
            <Link href="/kyc" className="text-fs-teal hover:underline">
              Complete KYC
            </Link>
          )}
          <Link href="/explain" className="text-fs-teal hover:underline">
            Advanced breakdown
          </Link>
        </div>
      </ActionPanel>
    </div>
  );
}
