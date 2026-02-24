"use client";

import { useState, useEffect } from "react";
import InvestForm from "@/components/InvestForm";
import FundStats from "@/components/FundStats";
import WalletConnect from "@/components/WalletConnect";
import {
  fetchFundStats,
  fetchKYCStatus,
  depositFunds,
  withdrawFunds,
  type FundStats as FundStatsType,
} from "@/lib/contracts";

export default function InvestPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [isKYCVerified, setIsKYCVerified] = useState(false);
  const [stats, setStats] = useState<FundStatsType | null>(null);
  const [txMessage, setTxMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchFundStats().then(setStats);
  }, []);

  useEffect(() => {
    if (address) {
      fetchKYCStatus(address).then(setIsKYCVerified);
    }
  }, [address]);

  const refreshStats = async () => {
    const newStats = await fetchFundStats();
    setStats(newStats);
  };

  const handleDeposit = async (amount: string) => {
    if (!address) return;
    setTxMessage(null);

    const result = await depositFunds(address, parseFloat(amount));
    if (result.success) {
      setTxMessage({ type: "success", text: `✅ Deposited €${amount} — ZK proof verified` });
      await refreshStats();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Deposit failed" });
    }
  };

  const handleWithdraw = async (amount: string) => {
    if (!address) return;
    setTxMessage(null);

    const result = await withdrawFunds(address, parseFloat(amount));
    if (result.success) {
      setTxMessage({ type: "success", text: `✅ Withdrew €${amount} — ZK proof verified` });
      await refreshStats();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Withdrawal failed" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invest</h1>
          <p className="text-gray-500">
            Deposit into the housing fund or withdraw your share. All transactions are private.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {/* Transaction feedback */}
      {txMessage && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            txMessage.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}
        >
          {txMessage.text}
        </div>
      )}

      {/* Fund stats */}
      {stats && <FundStats {...stats} />}

      {/* Invest form */}
      <InvestForm
        isKYCVerified={isKYCVerified}
        isConnected={!!address}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
      />
    </div>
  );
}
