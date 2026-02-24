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
      setTxMessage({ type: "success", text: `Deposited EUR ${amount} -- ZK proof verified` });
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
      setTxMessage({ type: "success", text: `Withdrew EUR ${amount} -- ZK proof verified` });
      await refreshStats();
    } else {
      setTxMessage({ type: "error", text: result.error ?? "Withdrawal failed" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Invest</h1>
          <p className="text-text-secondary">
            Deposit into the housing fund or withdraw your share. All transactions are private.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {txMessage && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            txMessage.type === "success"
              ? "bg-fs-teal/10 border border-fs-teal/20 text-fs-teal"
              : "bg-fs-magenta/10 border border-fs-magenta/20 text-fs-magenta-light"
          }`}
        >
          {txMessage.text}
        </div>
      )}

      {stats && <FundStats {...stats} />}

      <InvestForm
        isKYCVerified={isKYCVerified}
        isConnected={!!address}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
      />
    </div>
  );
}
