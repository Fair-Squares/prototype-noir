"use client";

import { useState, type FormEvent } from "react";
import { Button, FormField, Tabs } from "@/components/ui";

const INPUT_CLASS =
  "h-11 w-full rounded-md border border-border-strong bg-card px-3 text-body text-text-1 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60";

export interface TradeTicketProps {
  /** FSFT symbol for labels (from portfolio.fundTokenSymbol). */
  fundSymbol: string;
  /** EUR symbol for labels (from portfolio.eurTokenSymbol). */
  eurSymbol: string;
  /** Honest price band from the orderbook snapshot. */
  priceBandMinEur: number;
  priceBandMaxEur: number;
  priceReferenceEur: number;
  /** Whether the eligibility gate is open (portfolio.canTradeDex). */
  canTrade: boolean;
  /** Disabled while a place request is in flight. */
  busy: boolean;
  /** Submits a private order commitment. Returns nothing — parent shows result. */
  onPlace: (params: { side: "buy" | "sell"; amount: number; limitPriceEur?: number }) => void;
}

/**
 * Constrained Buy/Sell ticket for placing a PRIVATE order commitment.
 * No live order book to fill against — this only records an intent.
 */
export function TradeTicket({
  fundSymbol,
  eurSymbol,
  priceBandMinEur,
  priceBandMaxEur,
  priceReferenceEur,
  canTrade,
  busy,
  onPlace,
}: TradeTicketProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const [limitPrice, setLimitPrice] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; limitPrice?: string }>({});

  const amountId = "trade-amount";
  const priceId = "trade-limit-price";

  function validate(): { amount?: string; limitPrice?: string } {
    const next: { amount?: string; limitPrice?: string } = {};
    const amt = Number(amount);
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) {
      next.amount = "Enter an amount greater than zero.";
    }
    if (limitPrice.trim()) {
      const price = Number(limitPrice);
      if (!Number.isFinite(price) || price <= 0) {
        next.limitPrice = "Enter a price greater than zero.";
      } else if (price < priceBandMinEur || price > priceBandMaxEur) {
        next.limitPrice = `Price must sit inside the band €${priceBandMinEur.toFixed(4)}–€${priceBandMaxEur.toFixed(4)}.`;
      }
    }
    return next;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.amount) {
      document.getElementById(amountId)?.focus();
      return;
    }
    if (next.limitPrice) {
      document.getElementById(priceId)?.focus();
      return;
    }
    onPlace({
      side,
      amount: Number(amount),
      limitPriceEur: limitPrice.trim() ? Number(limitPrice) : undefined,
    });
  }

  const buyHint = `To buy ${fundSymbol}, settlement spends your private ${eurSymbol}. Move ${eurSymbol} to your private balance first.`;
  const sellHint = `To sell ${fundSymbol}, settlement spends your private ${fundSymbol} balance.`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Tabs
        aria-label="Order side"
        value={side}
        onValueChange={(v) => setSide(v as "buy" | "sell")}
        tabs={[
          { value: "buy", label: `Buy ${fundSymbol}` },
          { value: "sell", label: `Sell ${fundSymbol}` },
        ]}
      />

      <FormField
        label={`Amount (${fundSymbol})`}
        htmlFor={amountId}
        required
        error={errors.amount}
        hint={`Reference price €${priceReferenceEur.toFixed(4)} per ${fundSymbol}.`}
      >
        <input
          id={amountId}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy || !canTrade}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? `${amountId}-error` : `${amountId}-hint`}
          className={INPUT_CLASS}
        />
      </FormField>

      <FormField
        label={`Limit price (${eurSymbol}, optional)`}
        htmlFor={priceId}
        error={errors.limitPrice}
        hint={`Allowed band €${priceBandMinEur.toFixed(4)}–€${priceBandMaxEur.toFixed(4)}. Leave blank to use the reference price.`}
      >
        <input
          id={priceId}
          name="limitPrice"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.0001"
          value={limitPrice}
          onChange={(e) => setLimitPrice(e.target.value)}
          disabled={busy || !canTrade}
          aria-invalid={errors.limitPrice ? true : undefined}
          aria-describedby={errors.limitPrice ? `${priceId}-error` : `${priceId}-hint`}
          className={INPUT_CLASS}
        />
      </FormField>

      <p className="text-caption text-text-3">{side === "buy" ? buyHint : sellHint}</p>

      <Button type="submit" variant="primary" loading={busy} disabled={!canTrade} className="w-full">
        {busy ? "Submitting…" : side === "buy" ? `Place buy commitment` : `Place sell commitment`}
      </Button>
    </form>
  );
}
