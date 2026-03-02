"use client";

import { useState, useEffect, useCallback } from "react";
import InvestForm from "@/components/InvestForm";
import FundStats from "@/components/FundStats";
import InfoTooltip from "@/components/InfoTooltip";
import SimulationModeBadge from "@/components/SimulationModeBadge";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchFundStats,
  fetchKYCProfile,
  fetchPortfolio,
  depositFunds,
  type FundStats as FundStatsType,
  type PortfolioData,
  type KYCProfile,
} from "@/lib/contracts";

export default function InvestPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [kycProfile, setKycProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [stats, setStats] = useState<FundStatsType | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [txMessage, setTxMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshAll = useCallback(async () => {
    const [newStats, newPortfolio] = await Promise.all([
      fetchFundStats(),
      address ? fetchPortfolio(address, accountIndex) : Promise.resolve(null),
    ]);
    setStats(newStats);
    if (newPortfolio) setPortfolio(newPortfolio);
  }, [address, accountIndex]);

  useEffect(() => { fetchFundStats().then(setStats); }, []);

  useEffect(() => {
    if (!address) {
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      return;
    }
    Promise.all([
      fetchKYCProfile(address).then(setKycProfile),
      fetchPortfolio(address, accountIndex).then(setPortfolio),
    ]);
  }, [address, accountIndex]);

  const handleDeposit = async (amount: string) => {
    if (!address) return;
    setTxMessage(null);
    const result = await depositFunds(address, parseFloat(amount), accountIndex);
    if (result.success) {
      setTxMessage({ type: "success", text: result.message ?? `Deposited €${Number(amount).toLocaleString()}` });
      await refreshAll();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Transaction failed" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="mb-2">
          <SimulationModeBadge />
        </div>
        <h1 className="text-2xl mb-1">Invest</h1>
        <p className="text-text-2 text-sm">
          Add EURs to the fund. You receive FSFT later when approved purchases are executed.
        </p>
        {kycProfile.isInvestor && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-fs-mint px-2.5 py-1 text-xs font-semibold text-fs-teal-dark">
            Investor role granted
          </p>
        )}
      </div>

      {txMessage && (
        <div className={`rounded-lg p-3 text-sm font-medium flex items-start gap-2 ${
          txMessage.type === "success"
            ? "bg-fs-teal/10 text-fs-teal-dark border border-fs-teal/20"
            : "bg-red-50 text-red-600 border border-red-100"
        }`}>
          <span>{txMessage.type === "success" ? "✓" : "✗"}</span>
          {txMessage.text}
        </div>
      )}

      {stats ? (
        <FundStats {...stats} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)}
        </div>
      )}

      <div className="grid xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="rounded-2xl bg-card border border-border p-5">
          <InvestForm
            isInvestor={kycProfile.isInvestor}
            isConnected={!!address}
            eurBalance={portfolio?.eurBalance ?? 0}
            onDeposit={handleDeposit}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-1.5 mb-3">
              <h3 className="font-semibold text-sm">Token model</h3>
              <InfoTooltip text="EURs is your cash balance, FSFT is your fund share, and FSP is your reward token." />
            </div>
            <div className="space-y-3">
              {[
                {
                  symbol: "EURs",
                  color: "bg-blue-100 text-blue-700",
                  title: "EUR wallet balance",
                  summary: "Use this to deposit",
                  details:
                    "Your spendable cash balance for this app.",
                },
                {
                  symbol: "FSFT",
                  color: "bg-fs-mint text-fs-teal-dark",
                  title: "Fund share token",
                  summary: "Represents your share of the fund",
                  details:
                    "You receive FSFT after approved proposals are executed.",
                },
                {
                  symbol: "FSP",
                  color: "bg-amber-100 text-amber-700",
                  title: "Protocol Token",
                  summary: "Participation rewards",
                  details:
                    "FSP rewards deposits, FSFT participation, and voting activity.",
                },
              ].map((t) => (
                <div key={t.symbol} className="flex gap-3">
                  <div className={`rounded-md px-2 py-0.5 text-xs font-bold shrink-0 h-fit mt-0.5 ${t.color}`}>{t.symbol}</div>
                  <div>
                    <p className="text-sm font-medium inline-flex items-center gap-1.5">
                      {t.title}
                      <InfoTooltip text={t.details} align="right" />
                    </p>
                    <p className="text-xs text-text-3 mt-0.5 leading-relaxed">{t.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-1.5 mb-3">
              <h3 className="font-semibold text-sm">What happens after you deposit?</h3>
              <InfoTooltip text="Simple timeline from deposit to FSFT distribution." />
            </div>
            <div className="space-y-2 text-xs text-text-2">
              {[
                ["1", "Deposit is recorded", "Your EURs is added to your fund position."],
                ["2", "Some idle EUR may earn", "Unused EUR can be parked in lending while waiting."],
                ["3", "Investors vote", "Proposals decide which properties to buy."],
                ["4", "FSFT is distributed", "Once approved and executed, FSFT is distributed."],
              ].map(([step, label, sub]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="font-bold text-fs-teal shrink-0 w-8">{step}</span>
                  <div><span className="font-medium text-text-1">{label}</span><span className="text-text-3 ml-1">— {sub}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
