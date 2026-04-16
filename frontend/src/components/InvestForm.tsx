"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEURDecimals } from "@/lib/contracts";

interface InvestFormProps {
  isInvestor: boolean;
  isConnected: boolean;
  eurBalance: number;
  onDeposit: (amount: string) => Promise<void>;
}

export default function InvestForm({ isInvestor, isConnected, eurBalance, onDeposit }: InvestFormProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const maxAmount = eurBalance;
  const quickAmounts = [1_000, 5_000, 10_000, Math.floor(eurBalance)].filter(
    (value, index, values) => value > 0 && values.indexOf(value) === index
  );

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await onDeposit(amount);
      setSuccess(`Deposited ${formatEURDecimals(Number(amount))}.`);
      setAmount("");
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Deposit failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-border bg-bg p-6 text-center">
        <p className="font-semibold text-text-1">Connect your wallet first</p>
        <p className="mt-1 text-sm text-text-3">Use the top-right account button.</p>
      </div>
    );
  }

  if (!isInvestor) {
    return (
      <div className="rounded-xl border border-border bg-bg p-6 text-center">
        <p className="font-semibold text-text-1">KYC required</p>
        <p className="mt-1 text-sm text-text-3">Complete verification before depositing.</p>
        <Link href="/kyc" className="mt-3 inline-flex text-sm font-semibold text-fs-teal hover:underline">
          Go to KYC
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-bg p-3">
        <p className="text-xs uppercase tracking-wide text-text-3">Cash (EURs)</p>
        <p className="mt-1 text-lg font-semibold text-text-1">{formatEURDecimals(eurBalance)}</p>
      </div>

      <label className="block">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-text-3">Deposit Amount</p>
          <button
            type="button"
            onClick={() => setAmount(String(maxAmount))}
            className="text-xs font-semibold text-fs-teal hover:underline"
          >
            Use max
          </button>
        </div>

        <input
          type="number"
          min="0"
          step="100"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg font-semibold text-text-1"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {quickAmounts.map((quick) => (
          <button
            key={quick}
            type="button"
            onClick={() => setAmount(String(quick))}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-text-2 hover:bg-bg"
          >
            {formatEURDecimals(quick)}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/10 p-3 text-sm text-fs-teal-dark">{success}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
        className="w-full rounded-lg bg-fs-teal py-2.5 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
      >
        {loading ? "Processing..." : "Deposit"}
      </button>
    </div>
  );
}
