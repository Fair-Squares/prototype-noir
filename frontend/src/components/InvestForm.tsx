"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatEURDecimals, type DepositResult } from "@/lib/contracts";

interface InvestFormProps {
  isInvestor: boolean;
  isConnected: boolean;
  eurBalance: number;
  onDeposit: (amount: string) => Promise<DepositResult>;
}

function shortHash(hash?: string | null): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

export default function InvestForm({ isInvestor, isConnected, eurBalance, onDeposit }: InvestFormProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const maxAmount = eurBalance;
  const quickAmounts = [1_000, 5_000, 10_000, Math.floor(eurBalance)].filter(
    (value, index, values) => value > 0 && values.indexOf(value) === index
  );

  const handleSubmit = async () => {
    setError(null);
    setResult(null);
    setElapsed(0);
    setLoading(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    try {
      const res = await onDeposit(amount);
      if (!res.success) {
        setError(res.error ?? "Deposit failed.");
      } else {
        setResult(res);
        setAmount("");
      }
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Deposit failed.");
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
          disabled={loading}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg font-semibold text-text-1 disabled:opacity-60"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {quickAmounts.map((quick) => (
          <button
            key={quick}
            type="button"
            onClick={() => setAmount(String(quick))}
            disabled={loading}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-text-2 hover:bg-bg disabled:opacity-50"
          >
            {formatEURDecimals(quick)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/5 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-fs-teal" />
            <span className="font-semibold text-text-1">Submitting to Aztec… {elapsed}s</span>
          </div>
          <p className="mt-1 text-xs text-text-3">
            Generating the private proof and sending two on-chain transactions (EUR transfer + private
            deposit). This usually takes 30–60s; your position updates once the deposit is included in a
            block.
          </p>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {result?.success && !loading && (
        <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/10 p-3 text-sm text-fs-teal-dark">
          <p className="font-semibold">
            ✓ Deposit included on-chain
            {result.blockNumber != null ? ` — block ${result.blockNumber}` : ""}
          </p>
          <dl className="mt-2 space-y-1 text-xs text-text-2">
            {result.eurTransferTxHash && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-3">
                  EUR transfer
                  {result.eurTransferBlockNumber != null ? ` · block ${result.eurTransferBlockNumber}` : ""}
                </dt>
                <dd className="font-mono">{shortHash(result.eurTransferTxHash)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-3">Private deposit{result.status ? ` · ${result.status}` : ""}</dt>
              <dd className="font-mono">{shortHash(result.txHash)}</dd>
            </div>
          </dl>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
        className="w-full rounded-lg bg-fs-teal py-2.5 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
      >
        {loading ? `Processing… ${elapsed}s` : "Deposit"}
      </button>
    </div>
  );
}
