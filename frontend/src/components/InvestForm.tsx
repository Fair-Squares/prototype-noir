"use client";

import { useState } from "react";

interface InvestFormProps {
  isKYCVerified: boolean;
  isConnected: boolean;
  onDeposit: (amount: string) => Promise<void>;
  onWithdraw: (amount: string) => Promise<void>;
}

export default function InvestForm({ isKYCVerified, isConnected, onDeposit, onWithdraw }: InvestFormProps) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === "deposit") {
        await onDeposit(amount);
      } else {
        await onWithdraw(amount);
      }
      setAmount("");
    } catch (e: any) {
      setError(e.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-10 text-center">
        <div className="text-4xl mb-3">🔗</div>
        <p className="text-gray-600 font-medium mb-1">Connect your wallet to invest</p>
        <p className="text-sm text-gray-400">Your investment is private — only you can see your balance</p>
      </div>
    );
  }

  if (!isKYCVerified) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-10 text-center">
        <div className="text-4xl mb-3">🛂</div>
        <p className="text-gray-700 font-medium mb-2">Complete KYC before investing</p>
        <a
          href="/kyc"
          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium text-sm"
        >
          Go to KYC verification →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mode === m
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
            }`}
          >
            {m === "deposit" ? "💶 Deposit" : "📤 Withdraw"}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div className="mb-5">
        <label className="block text-sm text-gray-600 mb-2 font-medium">
          Amount (EUR)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="100"
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-300"
          />
          <span className="flex items-center px-4 text-gray-400 text-sm font-medium">EUR</span>
        </div>
        {/* Quick amounts */}
        <div className="flex gap-2 mt-3">
          {[1000, 5000, 10000, 50000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
            >
              €{v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Privacy notice */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-5 text-sm text-emerald-700">
        🔒 This {mode} is <strong>private</strong> — it runs in your local PXE.
        Nobody can see your identity or amount on-chain. Only the fund total updates publicly.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {loading
          ? "⏳ Generating ZK proof…"
          : mode === "deposit"
            ? `Deposit €${amount || "0"}`
            : `Withdraw €${amount || "0"}`}
      </button>
    </div>
  );
}
