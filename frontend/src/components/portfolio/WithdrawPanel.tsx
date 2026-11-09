"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, LoadingSkeleton } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";

export interface WithdrawPanelProps {
  /** Loads the caller's individual deposits (the withdrawable units). */
  fetchDeposits: () => Promise<number[]>;
  disabled?: boolean;
  /** Wired to withdrawFunds in the page; resolves with success + message. */
  onWithdraw: (amount: number) => Promise<{ success: boolean; message?: string; error?: string }>;
}

/**
 * Withdraw as a pick-list. A withdrawal takes
 * back one whole deposit, so the panel lists the user's deposits as rows with
 * a Withdraw button each — the protocol constraint becomes the natural UI
 * instead of a free-amount field that only accepts exact past amounts.
 */
export function WithdrawPanel({ fetchDeposits, disabled = false, onWithdraw }: WithdrawPanelProps) {
  const [deposits, setDeposits] = useState<number[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDeposits(await fetchDeposits());
    } catch (e: unknown) {
      setDeposits(null);
      setLoadError(e instanceof Error ? e.message : "Could not load your deposits.");
    }
  }, [fetchDeposits]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleWithdraw = async (amount: number, index: number) => {
    setResult(null);
    setBusyIndex(index);
    try {
      const res = await onWithdraw(amount);
      if (res.success) {
        setResult({ tone: "success", text: res.message ?? `Withdrew ${formatEUR(amount)}.` });
        await load();
      } else {
        setResult({ tone: "danger", text: res.error ?? "Withdrawal failed." });
      }
    } catch (e: unknown) {
      setResult({ tone: "danger", text: e instanceof Error ? e.message : "Withdrawal failed." });
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {loadError ? (
        <Alert tone="danger" title="Could not load your deposits">
          {loadError}
        </Alert>
      ) : null}

      <div aria-live="polite">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      </div>

      {deposits === null && !loadError ? (
        <LoadingSkeleton lines={2} />
      ) : deposits !== null && deposits.length === 0 ? (
        <EmptyState
          title="No deposits to withdraw"
          description="Each deposit you make appears here as its own row — a withdrawal takes back one whole deposit."
        />
      ) : deposits !== null ? (
        <div className="divide-y divide-border">
          {deposits.map((amount, index) => (
            <div
              key={`${amount}-${index}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-body text-text-1">
                  Deposit of <span className="text-mono">{formatEUR(amount)}</span>
                </p>
                <p className="text-caption mt-0.5 text-text-3">
                  Withdrawn in full, back to your wallet.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={busyIndex === index}
                disabled={disabled || busyIndex !== null}
                onClick={() => void handleWithdraw(amount, index)}
              >
                {busyIndex === index ? "Withdrawing…" : "Withdraw"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
