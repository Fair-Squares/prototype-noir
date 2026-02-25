"use client";

import { useState, useEffect, useCallback } from "react";
import InvestForm from "@/components/InvestForm";
import FundStats from "@/components/FundStats";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchFundStats,
  fetchKYCStatus,
  fetchPortfolio,
  depositFunds,
  withdrawFunds,
  type FundStats as FundStatsType,
  type PortfolioData,
} from "@/lib/contracts";

export default function InvestPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;

  const [isKYCVerified, setIsKYCVerified] = useState(false);
  const [stats, setStats] = useState<FundStatsType | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [txMessage, setTxMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshAll = useCallback(async () => {
    const [newStats, newPortfolio] = await Promise.all([
      fetchFundStats(),
      address ? fetchPortfolio(address) : Promise.resolve(null),
    ]);
    setStats(newStats);
    if (newPortfolio) setPortfolio(newPortfolio);
  }, [address]);

  useEffect(() => { fetchFundStats().then(setStats); }, []);

  useEffect(() => {
    if (!address) return;
    Promise.all([
      fetchKYCStatus(address).then(setIsKYCVerified),
      fetchPortfolio(address).then(setPortfolio),
    ]);
  }, [address]);

  const handleDeposit = async (amount: string) => {
    if (!address) return;
    setTxMessage(null);
    const result = await depositFunds(address, parseFloat(amount));
    if (result.success) {
      setTxMessage({ type: "success", text: result.message ?? `Deposited €${Number(amount).toLocaleString()}` });
      await refreshAll();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Transaction failed" });
    }
  };

  const handleWithdraw = async (amount: string) => {
    if (!address) return;
    setTxMessage(null);
    const result = await withdrawFunds(address, parseFloat(amount));
    if (result.success) {
      setTxMessage({ type: "success", text: result.message ?? `Withdrew €${Number(amount).toLocaleString()}` });
      await refreshAll();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Transaction failed" });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Invest</h1>
        <p className="text-text-2 text-sm">
          Deposit EUR into the fund and receive FSFT tokens. 1 FSFT = 1 EUR.
        </p>
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

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <InvestForm
          isKYCVerified={isKYCVerified}
          isConnected={!!address}
          eurBalance={portfolio?.eurBalance ?? 0}
          fsftBalance={portfolio?.balance ?? 0}
          onDeposit={handleDeposit}
          onWithdraw={handleWithdraw}
        />

        <div className="space-y-4">
          <div className="rounded-xl bg-card p-5">
            <h3 className="font-semibold mb-3 text-sm">Token model</h3>
            <div className="space-y-3">
              {[
                { symbol: "EURs", color: "bg-blue-100 text-blue-700", title: "EUR Stablecoin", desc: "Your spendable EUR. Backed 1:1, stored as a private Aztec note — nobody can see your balance." },
                { symbol: "FSFT", color: "bg-fs-mint text-fs-teal-dark", title: "Fund Token", desc: "Proof of your share in the housing fund. 1 FSFT = 1 EUR invested. Redeemable at any time." },
              ].map((t) => (
                <div key={t.symbol} className="flex gap-3">
                  <div className={`rounded-md px-2 py-0.5 text-xs font-bold shrink-0 h-fit mt-0.5 ${t.color}`}>{t.symbol}</div>
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-text-3 mt-0.5 leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-card p-5">
            <h3 className="font-semibold mb-3 text-sm">What happens to your EUR?</h3>
            <div className="space-y-2 text-xs text-text-2">
              {[["40%", "Placed in DeFi vault", "Earns ~3% APY"], ["49%", "Reserved for housing", "Next property purchase"], ["11%", "Available liquidity", "Instant withdrawals"]].map(([pct, label, sub]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="font-bold text-fs-teal shrink-0 w-8">{pct}</span>
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
