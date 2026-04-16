"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  cancelDexOrder,
  fetchDexOrderbook,
  fetchKYCProfile,
  formatEURDecimals,
  matchDexOrder,
  placeDexOrder,
  type DexOrderbook,
  type KYCProfile,
} from "@/lib/contracts";

export default function DexPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [orderbook, setOrderbook] = useState<DexOrderbook | null>(null);
  const [profile, setProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const book = await fetchDexOrderbook(address ?? undefined);
      setOrderbook(book);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Could not load DEX orderbook.");
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!address) {
      setProfile({ verified: false, isInvestor: false, roles: [] });
      return;
    }

    fetchKYCProfile(address)
      .then(setProfile)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load KYC status.");
      });
  }, [address]);

  const notify = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const submitOrder = async () => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }

    setBusy(true);
    try {
      const result = await placeDexOrder(
        address,
        side,
        Number(amount),
        limitPrice ? Number(limitPrice) : undefined,
        accountIndex
      );
      if (!result.success) {
        notify("error", result.error ?? "Order failed");
        return;
      }
      notify("success", "Order placed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (orderId: number) => {
    if (!address) return;

    setBusy(true);
    try {
      const result = await cancelDexOrder(address, orderId, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Cancel failed");
        return;
      }
      notify("success", "Order cancelled.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const matchOrder = async (orderId: number) => {
    if (!address) return;

    setBusy(true);
    try {
      const result = await matchDexOrder(address, orderId, undefined, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Match failed");
        return;
      }
      notify("success", "Match attempted.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="FSFT / EUR DEX"
        subtitle="Simple flow: place an order, then manage it from your order list."
        ctaHref="/portfolio"
        ctaLabel="Open My Account"
      />

      {loadError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          msg.type === "success"
            ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
            : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {msg.text}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PrimaryCard
          title="Investor Status"
          value={profile.isInvestor ? "Ready" : "Not Ready"}
          hint="KYC investor role required for trading"
        />
        <PrimaryCard
          title="Reference Price"
          value={orderbook ? `€${orderbook.priceReferenceEur.toFixed(4)}` : "-"}
          hint="Current estimated FSFT price"
        />
        <PrimaryCard
          title="Allowed Price Band"
          value={orderbook ? `€${orderbook.priceBandMinEur.toFixed(4)} - €${orderbook.priceBandMaxEur.toFixed(4)}` : "-"}
          hint="Orders outside this range are rejected"
          accent
        />
      </section>

      {!profile.isInvestor && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-text-2">
          Complete KYC investor onboarding first, then you can place DEX orders.
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Primary Action</p>
          <h2 className="text-lg font-semibold mb-3">Place order</h2>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("buy")}
              className={`rounded-lg py-2 text-sm font-semibold ${side === "buy" ? "bg-fs-mint text-fs-teal-dark" : "bg-bg text-text-2"}`}
            >
              Buy FSFT
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`rounded-lg py-2 text-sm font-semibold ${side === "sell" ? "bg-pink-50 text-fs-magenta" : "bg-bg text-text-2"}`}
            >
              Sell FSFT
            </button>
          </div>

          <label className="block mb-3">
            <p className="text-xs text-text-3 mb-1">Amount (FSFT)</p>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="0"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
          </label>

          <label className="block mb-4">
            <p className="text-xs text-text-3 mb-1">Limit price (optional)</p>
            <input
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              type="number"
              min="0"
              step="0.0001"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
          </label>

          <button
            disabled={!address || !profile.isInvestor || busy}
            onClick={submitOrder}
            className="w-full rounded-lg bg-fs-teal py-2.5 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Submit Order"}
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Order Management</p>
          <h2 className="text-lg font-semibold mb-3">Your orders</h2>

          <div className="space-y-2">
            {orderbook?.userOrders.length ? orderbook.userOrders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3">
                <div className="text-xs">
                  <p>#{order.id} • {order.side.toUpperCase()} • {order.remaining}/{order.amount} FSFT</p>
                  <p>{formatEURDecimals(order.priceEur)} • {order.status}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy || order.status === "cancelled" || order.status === "filled" || order.status === "expired"}
                    onClick={() => matchOrder(order.id)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs"
                  >
                    Match
                  </button>
                  <button
                    disabled={busy || order.status === "cancelled" || order.status === "filled" || order.status === "expired"}
                    onClick={() => cancelOrder(order.id)}
                    className="rounded-md bg-fs-anthracite px-2.5 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-border bg-bg p-4 text-sm text-text-3">No active orders yet.</p>
            )}
          </div>
        </div>
      </section>

      <AdvancedDetails summary="Advanced market depth">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-semibold mb-2 text-sm">Buy orders</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {orderbook?.buyOrders.length ? orderbook.buyOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs">
                  <p>#{order.id} • {order.remaining}/{order.amount} FSFT</p>
                  <p>€{order.priceEur.toFixed(4)} • {order.status}</p>
                </div>
              )) : <p className="text-xs text-text-3">No buy orders</p>}
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm">Sell orders</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {orderbook?.sellOrders.length ? orderbook.sellOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs">
                  <p>#{order.id} • {order.remaining}/{order.amount} FSFT</p>
                  <p>€{order.priceEur.toFixed(4)} • {order.status}</p>
                </div>
              )) : <p className="text-xs text-text-3">No sell orders</p>}
            </div>
          </div>
        </div>
      </AdvancedDetails>
    </div>
  );
}
