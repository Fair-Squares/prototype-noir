"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InvestForm from "@/components/InvestForm";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  depositFunds,
  fetchFundStats,
  fetchKYCProfile,
  fetchPortfolio,
  formatEUR,
  type FundStats,
  type KYCProfile,
  type PortfolioData,
} from "@/lib/contracts";

export default function InvestPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [kycProfile, setKycProfile] = useState<KYCProfile>({
    verified: false,
    isInvestor: false,
    roles: [],
  });
  const [stats, setStats] = useState<FundStats | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchFundStats()
      .then(setStats)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load fund data.");
      });
  }, []);

  useEffect(() => {
    if (!address) {
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      setPortfolio(null);
      return;
    }

    Promise.all([fetchKYCProfile(address), fetchPortfolio(address, accountIndex)])
      .then(([profile, nextPortfolio]) => {
        setKycProfile(profile);
        setPortfolio(nextPortfolio);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load account data.");
      });
  }, [address, accountIndex]);

  const refreshPortfolio = async () => {
    if (!address) return;
    const nextPortfolio = await fetchPortfolio(address, accountIndex);
    setPortfolio(nextPortfolio);
  };

  const handleDeposit = async (amount: string) => {
    if (!address) return;

    setMessage(null);
    const result = await depositFunds(address, Number.parseFloat(amount), accountIndex);
    if (!result.success) {
      setMessage({ type: "error", text: result.error ?? "Deposit failed." });
      return;
    }

    setMessage({ type: "success", text: result.message ?? `Deposited ${formatEUR(Number(amount))}` });
    await refreshPortfolio();
  };

  const sharePrice = useMemo(() => {
    if (!stats) return 0;
    const fundValue = stats.navEur ?? Math.max(0, stats.totalDeposits + stats.totalYield);
    return stats.navPerFsftEur ?? (stats.totalSupply > 0 ? fundValue / stats.totalSupply : 0);
  }, [stats]);

  const metrics = [
    { label: "Cash (EURs)", value: formatEUR(portfolio?.eurBalance ?? 0) },
    { label: "Current Position", value: formatEUR(portfolio?.depositedAmount ?? 0) },
    { label: "Share Price", value: `€${sharePrice.toFixed(4)}`, accent: true },
    { label: "KYC", value: kycProfile.isInvestor ? "Ready" : "Required" },
  ];

  return (
    <div className="space-y-6">
      <PageHero
        title="Invest"
        subtitle="Deposit cash into the fund in one step."
        ctaHref="/portfolio"
        ctaLabel="Open Account"
      />

      {loadError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <MetricRow items={metrics} />

      <ActionPanel title="Primary Action" subtitle="Deposit">
        <InvestForm
          isInvestor={kycProfile.isInvestor}
          isConnected={Boolean(address)}
          eurBalance={portfolio?.eurBalance ?? 0}
          onDeposit={handleDeposit}
        />
      </ActionPanel>

      <section className="surface p-5">
        <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Quick Checklist</p>
        <ol className="space-y-2 text-sm text-text-2">
          <li>1. Connect your account.</li>
          <li>2. Complete KYC if needed.</li>
          <li>3. Deposit cash and track position in Account.</li>
        </ol>
        {!kycProfile.isInvestor && (
          <Link href="/kyc" className="mt-3 inline-block text-sm font-semibold text-fs-teal hover:underline">
            Go to KYC
          </Link>
        )}
      </section>
    </div>
  );
}
