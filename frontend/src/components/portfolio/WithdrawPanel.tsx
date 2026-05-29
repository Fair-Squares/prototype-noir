"use client";

import { useId, useRef, useState } from "react";
import { ActionBar, Alert, Button, FormField } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";

export interface WithdrawPanelProps {
  /** Capital currently deposited (the upper bound for a withdrawal). */
  depositedAmount: number;
  disabled?: boolean;
  /** Wired to withdrawFunds in the page; resolves with success + message. */
  onWithdraw: (amount: number) => Promise<{ success: boolean; message?: string; error?: string }>;
}

/**
 * Withdraw capital from the fund. Inline validation via FormField; the first
 * error is focused on submit. Disables the control and shows "Withdrawing…"
 * while the request is in flight. Uses the real withdrawFunds wiring passed
 * down from the page.
 */
export function WithdrawPanel({ depositedAmount, disabled = false, onWithdraw }: WithdrawPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const validate = (raw: string): string | null => {
    const value = Number.parseFloat(raw);
    if (!raw.trim() || Number.isNaN(value)) return "Enter an amount to withdraw.";
    if (value <= 0) return "Amount must be greater than zero.";
    if (value > depositedAmount) return `You can withdraw at most ${formatEUR(depositedAmount)}.`;
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);
    const validationError = validate(amount);
    if (validationError) {
      setError(validationError);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await onWithdraw(Number.parseFloat(amount));
      if (res.success) {
        setResult({ tone: "success", text: res.message ?? "Withdrawal submitted." });
        setAmount("");
      } else {
        setResult({ tone: "danger", text: res.error ?? "Withdrawal failed." });
      }
    } catch (e: unknown) {
      setResult({ tone: "danger", text: e instanceof Error ? e.message : "Withdrawal failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Amount to withdraw"
        htmlFor={inputId}
        error={error ?? undefined}
        hint={`Up to ${formatEUR(depositedAmount)} deposited`}
        required
      >
        <input
          id={inputId}
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={amount}
          disabled={disabled || busy}
          onChange={(e) => {
            setAmount(e.target.value);
            if (error) setError(null);
          }}
          placeholder="0"
          aria-invalid={error ? true : undefined}
          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-mono text-text-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 disabled:opacity-50"
        />
      </FormField>

      <div aria-live="polite">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      </div>

      <ActionBar align="start">
        <Button type="submit" variant="secondary" loading={busy} disabled={disabled}>
          {busy ? "Withdrawing…" : "Withdraw"}
        </Button>
      </ActionBar>
    </form>
  );
}
