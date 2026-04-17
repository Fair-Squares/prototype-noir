"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import { DEMO_DEX_ORDERBOOK } from "@/lib/demoData";
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

  const [orderbook, setOrderbook] = useState<DexOrderbook | null>(DEMO_DEX_ORDERBOOK);
  const [profile, setProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const book = await fetchDexOrderbook(address ?? undefined, accountIndex);
      setOrderbook(book);
      setUsingDemoData(false);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Could not load trade data.");
      setOrderbook(DEMO_DEX_ORDERBOOK);
      setUsingDemoData(true);
    }
  }, [address, accountIndex]);

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
        notify("error", result.error ?? "Order failed.");
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
        notify("error", result.error ?? "Cancel failed.");
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
        notify("error", result.error ?? "Match failed.");
        return;
      }
      notify("success", "Match attempted.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const displayBook = orderbook ?? DEMO_DEX_ORDERBOOK;

  const metrics = [
    { label: "Investor Status", value: profile.isInvestor ? "Ready" : "Required" },
    {
      label: "Reference Price",
      value: `€${displayBook.priceReferenceEur.toFixed(4)}`,
      accent: true,
    },
    {
      label: "Price Band",
      value: `€${displayBook.priceBandMinEur.toFixed(4)} - €${displayBook.priceBandMaxEur.toFixed(4)}`,
    },
    { label: "Open Orders", value: String(displayBook.userOrders.length) },
  ];

  return (
    <div className="space-y-6">
      <PageHero
        title="Trade"
        subtitle="Place and manage Fund Shares orders."
        ctaHref="/portfolio"
        ctaLabel="Open Account"
      />

      {loadError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError} Showing seeded demo orderbook.
          <button
            type="button"
            onClick={refresh}
            className="ml-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {usingDemoData && !loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Demo orderbook data is shown for simulation preview.
        </div>
      )}

      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.type === "success"
              ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <MetricRow items={metrics} />

      <section className="grid gap-6 lg:grid-cols-2">
        <ActionPanel title="Primary Action" subtitle="Place Order">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("buy")}
              className={`rounded-lg py-2 text-sm font-semibold ${
                side === "buy" ? "bg-fs-mint text-fs-teal-dark" : "bg-bg text-text-2"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`rounded-lg py-2 text-sm font-semibold ${
                side === "sell" ? "bg-pink-50 text-fs-magenta" : "bg-bg text-text-2"
              }`}
            >
              Sell
            </button>
          </div>

          <label className="block mb-3">
            <p className="text-xs text-text-3 mb-1">Amount (Fund Shares)</p>
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
            {busy ? "Submitting..." : "Place"}
          </button>
          {!address && (
            <p className="mt-2 text-xs text-text-3">Connect a wallet to place or manage orders.</p>
          )}
        </ActionPanel>

        <ActionPanel title="Primary Action" subtitle="Manage Orders">
          <div className="space-y-2">
            {displayBook.userOrders.length ? (
              displayBook.userOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3"
                >
                  <div className="text-xs">
                    <p>
                      #{order.id} {order.side.toUpperCase()} {order.remaining}/{order.amount}
                    </p>
                    <p>{formatEURDecimals(order.priceEur)} · {order.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!address || busy || !["open", "partial"].includes(order.status)}
                      onClick={() => matchOrder(order.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs"
                    >
                      Match
                    </button>
                    <button
                      disabled={!address || busy || !["open", "partial"].includes(order.status)}
                      onClick={() => cancelOrder(order.id)}
                      className="rounded-md bg-fs-anthracite px-2.5 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-border bg-bg p-4 text-sm text-text-3">
                No active orders.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-text-3">
            Need full market depth? See{" "}
            <Link className="text-fs-teal hover:underline" href="/explain">
              Explain
            </Link>
            .
          </p>
        </ActionPanel>
      </section>
    </div>
  );
}
