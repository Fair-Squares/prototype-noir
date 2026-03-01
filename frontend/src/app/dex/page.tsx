"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import InfoTooltip from "@/components/InfoTooltip";
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
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const book = await fetchDexOrderbook(address ?? undefined);
    setOrderbook(book);
  }, [address]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!address) {
      setProfile({ verified: false, isInvestor: false, roles: [] });
      return;
    }
    fetchKYCProfile(address)
      .then(setProfile)
      .catch(() => setProfile({ verified: false, isInvestor: false, roles: [] }));
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
      } else {
        notify("success", "Order placed.");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (orderId: number) => {
    if (!address) return;
    setBusy(true);
    try {
      const result = await cancelDexOrder(address, orderId, accountIndex);
      if (!result.success) notify("error", result.error ?? "Cancel failed");
      else {
        notify("success", "Order cancelled.");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const matchOrder = async (orderId: number) => {
    if (!address) return;
    setBusy(true);
    try {
      const result = await matchDexOrder(address, orderId, undefined, accountIndex);
      if (!result.success) notify("error", result.error ?? "Match failed");
      else {
        notify("success", "Match attempted.");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl mb-1">FSFT / EUR DEX</h1>
        <p className="text-sm text-text-2">
          Investor-only secondary trading with guardrails. Prices stay within NAV ±2% to avoid speculation.
        </p>
      </section>

      {msg && (
        <div
          className={`rounded-lg p-3 text-sm font-medium ${
            msg.type === "success"
              ? "bg-fs-teal/10 text-fs-teal-dark border border-fs-teal/20"
              : "bg-red-50 text-red-700 border border-red-100"
          }`}
        >
          {msg.text}
        </div>
      )}

      {!profile.isInvestor && (
        <div className="rounded-xl border border-border bg-bg p-4 text-sm text-text-2">
          Complete KYC to trade FSFT and EUR on the protocol DEX.
        </div>
      )}

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Place order</h2>
            <InfoTooltip text="Orders are restricted to NAV ±2%. This keeps price discovery tied to fund value, not speculation." />
          </div>

          <div className="grid grid-cols-2 gap-2">
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

          <label className="block">
            <p className="text-xs text-text-3 mb-1">Amount (FSFT)</p>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <p className="text-xs text-text-3 mb-1">Limit price (EUR, optional)</p>
            <input
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              type="number"
              min="0"
              step="0.0001"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
          </label>

          <button
            disabled={!address || !profile.isInvestor || busy}
            onClick={submitOrder}
            className="w-full rounded-lg bg-fs-teal text-white py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit order"}
          </button>

          {orderbook && (
            <div className="rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
              <p>Reference NAV price: <strong>€{orderbook.priceReferenceEur.toFixed(4)}</strong></p>
              <p>
                Allowed band: €{orderbook.priceBandMinEur.toFixed(4)} - €{orderbook.priceBandMaxEur.toFixed(4)}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Buy orders</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {orderbook?.buyOrders.length ? orderbook.buyOrders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs">
                      <p>#{order.id} • {order.remaining}/{order.amount} FSFT</p>
                      <p>€{order.priceEur.toFixed(4)} • {order.status}</p>
                    </div>
                  )) : <p className="text-xs text-text-3">No buy orders</p>}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Sell orders</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {orderbook?.sellOrders.length ? orderbook.sellOrders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs">
                      <p>#{order.id} • {order.remaining}/{order.amount} FSFT</p>
                      <p>€{order.priceEur.toFixed(4)} • {order.status}</p>
                    </div>
                  )) : <p className="text-xs text-text-3">No sell orders</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-3">Your orders</h3>
            <div className="space-y-2">
              {orderbook?.userOrders.length ? orderbook.userOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-border bg-bg p-3 flex flex-wrap items-center gap-2 justify-between">
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
                      className="rounded-md bg-fs-anthracite text-white px-2.5 py-1 text-xs disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )) : <p className="text-xs text-text-3">No active orders yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
