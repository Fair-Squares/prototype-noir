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
      <div className="rounded-2xl bg-surface-card border border-surface-border p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-fs-teal/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-fs-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
          </svg>
        </div>
        <p className="text-text-primary font-semibold mb-1">Connect your wallet to invest</p>
        <p className="text-sm text-text-muted">Your investment is private -- only you can see your balance</p>
      </div>
    );
  }

  if (!isKYCVerified) {
    return (
      <div className="rounded-2xl bg-fs-magenta/5 border border-fs-magenta/15 p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-fs-magenta/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-fs-magenta-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
          </svg>
        </div>
        <p className="text-text-primary font-semibold mb-2">Complete KYC before investing</p>
        <a
          href="/kyc"
          className="inline-flex items-center gap-1 text-fs-teal hover:text-fs-teal-light font-medium text-sm"
        >
          Go to KYC verification &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-card border border-surface-border p-6">
      {/* Mode toggle */}
      <div className="flex gap-2 mb-6 bg-surface-raised rounded-xl p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === m
                ? "bg-fs-teal text-white shadow-lg shadow-fs-teal/20"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {m === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div className="mb-5">
        <label className="block text-sm text-text-muted mb-2 font-medium">Amount (EUR)</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="100"
            className="flex-1 bg-surface-raised border border-surface-border rounded-xl px-4 py-3 text-text-primary text-lg font-medium focus:outline-none focus:ring-2 focus:ring-fs-teal/40 focus:border-fs-teal/40 placeholder:text-text-muted"
          />
          <span className="flex items-center px-4 text-text-muted text-sm font-medium">EUR</span>
        </div>
        <div className="flex gap-2 mt-3">
          {[1000, 5000, 10000, 50000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="px-3 py-1.5 rounded-lg bg-surface-raised border border-surface-border text-text-muted text-xs font-medium hover:text-text-secondary hover:border-surface-border-hover"
            >
              {v.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </button>
          ))}
        </div>
      </div>

      {/* Privacy notice */}
      <div className="bg-fs-teal/5 border border-fs-teal/10 rounded-xl p-3 mb-5 text-sm text-fs-teal flex items-start gap-2">
        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        This {mode} is <strong>private</strong> -- runs in your local PXE.
        Nobody can see your identity or amount on-chain.
      </div>

      {error && (
        <div className="bg-fs-magenta/10 border border-fs-magenta/20 rounded-xl p-3 mb-5 text-sm text-fs-magenta-light">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fs-teal to-fs-teal-dark hover:from-fs-teal-light hover:to-fs-teal text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-fs-teal/20 transition-all"
      >
        {loading
          ? "Generating ZK proof..."
          : mode === "deposit"
            ? `Deposit ${amount ? `EUR ${parseFloat(amount).toLocaleString()}` : ""}`
            : `Withdraw ${amount ? `EUR ${parseFloat(amount).toLocaleString()}` : ""}`}
      </button>
    </div>
  );
}
