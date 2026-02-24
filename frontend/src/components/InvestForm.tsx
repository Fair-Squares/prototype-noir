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
      <div className="rounded-xl bg-gray-50 p-12 text-center">
        <p className="font-semibold text-fs-anthracite mb-1">Connect your wallet to invest</p>
        <p className="text-sm text-gray-400">Your balance is private and only visible to you.</p>
      </div>
    );
  }

  if (!isKYCVerified) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-100 p-10 text-center">
        <p className="font-semibold text-fs-anthracite mb-2">Verify your identity first</p>
        <p className="text-sm text-gray-500 mb-4">
          We need a quick identity check before you can invest. Your personal details are never stored.
        </p>
        <a
          href="/kyc"
          className="inline-flex items-center gap-1 text-fs-teal hover:text-fs-teal-dark font-medium text-sm"
        >
          Verify now &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-6">
      {/* Mode toggle */}
      <div className="flex gap-2 mb-6 bg-gray-50 rounded-lg p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 rounded-md text-sm font-semibold ${
              mode === m
                ? "bg-white text-fs-anthracite shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {m === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="mb-5">
        <label className="block text-sm text-gray-500 mb-2 font-medium">Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="100"
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-fs-anthracite text-lg font-medium focus:outline-none focus:ring-2 focus:ring-fs-teal/30 focus:border-fs-teal placeholder:text-gray-300"
        />
        <div className="flex gap-2 mt-3">
          {[1000, 5000, 10000, 50000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="px-3 py-1.5 rounded-md bg-gray-50 text-gray-500 text-xs font-medium hover:bg-gray-100"
            >
              EUR {v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-5">
        Your {mode} is completely private. Nobody can see who you are or how much you {mode === "deposit" ? "put in" : "take out"}.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-5 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full py-3 rounded-lg bg-fs-teal hover:bg-fs-teal-dark text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading
          ? "Processing..."
          : mode === "deposit"
            ? `Deposit EUR ${amount || "0"}`
            : `Withdraw EUR ${amount || "0"}`}
      </button>
    </div>
  );
}
