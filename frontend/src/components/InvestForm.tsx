"use client";

import { useState } from "react";
import { formatEURDecimals } from "@/lib/contracts";

interface InvestFormProps {
  isKYCVerified: boolean;
  isConnected: boolean;
  eurBalance: number;     // EUR available in wallet to deposit
  fsftBalance: number;    // FSFT (= EUR) already in fund
  onDeposit: (amount: string) => Promise<void>;
  onWithdraw: (amount: string) => Promise<void>;
}

export default function InvestForm({
  isKYCVerified,
  isConnected,
  eurBalance,
  fsftBalance,
  onDeposit,
  onWithdraw,
}: InvestFormProps) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableBalance = mode === "deposit" ? eurBalance : fsftBalance;
  const maxAmount = availableBalance;

  const quickAmounts = mode === "deposit"
    ? [1_000, 5_000, 10_000, Math.floor(eurBalance * 0.5), eurBalance].filter(
        (v, i, a) => v > 0 && a.indexOf(v) === i
      )
    : [1_000, 5_000, Math.floor(fsftBalance * 0.25), Math.floor(fsftBalance * 0.5), fsftBalance].filter(
        (v, i, a) => v > 0 && a.indexOf(v) === i
      );

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "deposit") {
        await onDeposit(amount);
        setSuccess(`Deposited ${formatEURDecimals(Number(amount))} → received ${Number(amount)} FSFT`);
      } else {
        await onWithdraw(amount);
        setSuccess(`Withdrew ${Number(amount)} FSFT → received ${formatEURDecimals(Number(amount))}`);
      }
      setAmount("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-card p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-fs-mint mx-auto mb-4 flex items-center justify-center">
          <svg className="w-6 h-6 text-fs-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
          </svg>
        </div>
        <p className="font-semibold mb-1">Connect your wallet to invest</p>
        <p className="text-sm text-text-3">Your share in the fund is tracked privately by FSFT tokens (1 FSFT = 1 EUR)</p>
      </div>
    );
  }

  if (!isKYCVerified) {
    return (
      <div className="rounded-xl bg-card p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <p className="font-semibold mb-2">Identity verification required</p>
        <p className="text-sm text-text-3 mb-4">
          A quick check is required before investing to comply with housing fund regulations.
        </p>
        <a href="/kyc" className="inline-flex items-center gap-1.5 text-fs-teal hover:text-fs-teal-dark font-medium text-sm">
          Verify with zkPassport
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-6 space-y-5">
      {/* Token balances */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-bg p-3 border border-border">
          <p className="text-[11px] text-text-3 font-medium uppercase tracking-wide mb-1">Wallet balance</p>
          <p className="text-lg font-bold">{formatEURDecimals(eurBalance)}</p>
          <p className="text-xs text-text-3 mt-0.5">EURs stablecoin</p>
        </div>
        <div className="rounded-lg bg-fs-mint p-3 border border-transparent">
          <p className="text-[11px] text-fs-teal-dark font-medium uppercase tracking-wide mb-1">In fund</p>
          <p className="text-lg font-bold text-fs-teal-dark">{formatEURDecimals(fsftBalance)}</p>
          <p className="text-xs text-fs-teal-dark/60 mt-0.5">FSFT fund tokens</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setAmount(""); setError(null); setSuccess(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px capitalize transition-colors ${
              mode === m
                ? "border-fs-teal text-text-1"
                : "border-transparent text-text-3 hover:text-text-2"
            }`}
          >
            {m === "deposit" ? "Deposit EUR → FSFT" : "Withdraw FSFT → EUR"}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-text-3 font-medium">
            {mode === "deposit" ? "EUR amount" : "FSFT amount"}
          </label>
          <button
            onClick={() => setAmount(String(maxAmount))}
            className="text-xs text-fs-teal hover:underline font-medium"
          >
            Max: {formatEURDecimals(maxAmount)}
          </button>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-3 text-xl font-medium select-none">€</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="100"
            className="w-full bg-bg border border-border rounded-lg pl-9 pr-4 py-3 text-text-1 text-xl font-medium focus:outline-none focus:border-fs-teal placeholder:text-text-3"
          />
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {quickAmounts.slice(0, 5).map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="px-3 py-1 rounded-md bg-bg text-text-3 text-xs font-medium hover:text-text-2 border border-border"
            >
              {v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange rate note */}
      {amount && Number(amount) > 0 && (
        <div className="rounded-lg bg-fs-mint/50 p-3 text-xs text-fs-teal-dark">
          {mode === "deposit" ? (
            <>You will receive <strong>{Number(amount).toLocaleString()} FSFT</strong> — representing {formatEURDecimals(Number(amount))} in the fund</>
          ) : (
            <>You will receive <strong>{formatEURDecimals(Number(amount))}</strong> — {Number(amount).toLocaleString()} FSFT will be burned</>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-fs-mint border border-fs-teal/20 p-3 text-sm text-fs-teal-dark">{success}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
        className="w-full py-3 rounded-lg bg-fs-teal hover:bg-fs-teal-dark text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
      >
        {loading
          ? "Processing…"
          : mode === "deposit"
          ? `Deposit ${amount ? formatEURDecimals(Number(amount)) : ""}`
          : `Withdraw ${amount ? formatEURDecimals(Number(amount)) : ""}`}
      </button>

      <p className="text-xs text-text-3 text-center">
        1 FSFT = 1 EUR · {mode === "deposit" ? "Your balance is private on Aztec" : "Funds return to your EURs wallet"}
      </p>
    </div>
  );
}
