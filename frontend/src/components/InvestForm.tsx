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
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-card p-12 text-center">
        <p className="font-semibold text-text-1 mb-1">Connect your wallet to invest</p>
        <p className="text-sm text-text-3">Your share in the fund is tracked by fund tokens (FSFT)</p>
      </div>
    );
  }

  if (!isKYCVerified) {
    return (
      <div className="rounded-xl bg-card p-10 text-center">
        <p className="font-semibold text-text-1 mb-2">Verify your identity first</p>
        <p className="text-sm text-text-3 mb-4">Quick identity check required before investing. Your details are not stored on-chain.</p>
        <a href="/kyc" className="text-fs-teal hover:text-fs-teal-light font-medium text-sm">
          Verify now &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-6">
      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-border">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px capitalize ${
              mode === m
                ? "border-fs-teal text-text-1"
                : "border-transparent text-text-3 hover:text-text-2"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-text-3 font-medium">Amount</label>
          <span className="text-xs text-text-3">Balance: EUR 0.00</span>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          min="0"
          step="100"
          className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-text-1 text-xl font-medium focus:outline-none focus:border-fs-teal/40 placeholder:text-text-3"
        />
        <div className="flex gap-2 mt-3">
          {[1000, 5000, 10000, 50000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="px-3 py-1 rounded-md bg-bg text-text-3 text-xs font-medium hover:text-text-2 border border-border"
            >
              {v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-fs-magenta/10 rounded-lg p-3 mb-5 text-sm text-fs-magenta-light">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full py-3 rounded-lg bg-fs-teal hover:bg-fs-teal-dark text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed text-sm"
      >
        {loading ? "Processing..." : mode === "deposit" ? "Deposit" : "Withdraw"}
      </button>
    </div>
  );
}
