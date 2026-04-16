"use client";

import { useState, useEffect, useCallback } from "react";
import FundStats from "@/components/FundStats";
import InvestForm from "@/components/InvestForm";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  depositFunds,
  fetchFundStats,
  fetchKYCProfile,
  fetchPortfolio,
  formatEUR,
  type FundStats as FundStatsType,
  type KYCProfile,
  type PortfolioData,
} from "@/lib/contracts";

export default function InvestPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [kycProfile, setKycProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [stats, setStats] = useState<FundStatsType | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [txMessage, setTxMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const [newStats, newPortfolio] = await Promise.all([
      fetchFundStats(),
      address ? fetchPortfolio(address, accountIndex) : Promise.resolve(null),
    ]);
    setStats(newStats);
    setPortfolio(newPortfolio);
  }, [address, accountIndex]);

  useEffect(() => {
    fetchFundStats().then(setStats).catch((error: unknown) => {
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
        setLoadError(error instanceof Error ? error.message : "Could not load account details.");
      });
  }, [address, accountIndex]);

  const handleDeposit = async (amount: string) => {
    if (!address) return;

    setTxMessage(null);
    const result = await depositFunds(address, Number.parseFloat(amount), accountIndex);

    if (!result.success) {
      setTxMessage({ type: "error", text: result.error ?? "Transaction failed" });
      return;
    }

    setTxMessage({ type: "success", text: result.message ?? `Deposited ${formatEUR(Number(amount))}` });
    await refreshAll();
  };

  const estimatedPrice = stats?.navPerFsftEur ?? (stats && stats.totalSupply > 0 ? (stats.navEur ?? 0) / stats.totalSupply : 0);

  return (
    <div className="space-y-6">
      <PageHero
        title="Invest"
        subtitle="One step: deposit EUR into the fund. FSFT is distributed after approved proposals execute."
        ctaHref="/portfolio"
        ctaLabel="Open My Account"
      />

      {loadError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {txMessage && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          txMessage.type === "success"
            ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
            : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {txMessage.text}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PrimaryCard
          title="Wallet EUR"
          value={formatEUR(portfolio?.eurBalance ?? 0)}
          hint="Spendable balance for deposit"
        />
        <PrimaryCard
          title="Your Fund Position"
          value={formatEUR(portfolio?.depositedAmount ?? 0)}
          hint="Recorded deposit in the fund"
        />
        <PrimaryCard
          title="Estimated FSFT Price"
          value={`€${estimatedPrice.toFixed(4)}`}
          hint="Fund value divided by FSFT supply"
          accent
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Primary Action</p>
          <h2 className="text-lg font-semibold mb-4">Deposit into the fund</h2>
          <InvestForm
            isInvestor={kycProfile.isInvestor}
            isConnected={Boolean(address)}
            eurBalance={portfolio?.eurBalance ?? 0}
            onDeposit={handleDeposit}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">What Happens Next</p>
          <h2 className="text-lg font-semibold mb-3">Simple flow</h2>
          <ol className="space-y-2 text-sm text-text-2">
            <li>1. Your EUR deposit is recorded in the fund.</li>
            <li>2. Governance decides where capital goes.</li>
            <li>3. On executed proposals, FSFT distribution opens.</li>
            <li>4. You can later trade FSFT and claim FSP rewards.</li>
          </ol>
          {!kycProfile.isInvestor && (
            <a
              href="/kyc"
              className="mt-4 inline-flex rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
            >
              Complete KYC First
            </a>
          )}
        </div>
      </section>

      <AdvancedDetails summary="Advanced fund details">
        {stats ? (
          <FundStats {...stats} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-bg animate-pulse" />
            ))}
          </div>
        )}
      </AdvancedDetails>
    </div>
  );
}
