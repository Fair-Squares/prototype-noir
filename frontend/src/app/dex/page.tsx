"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
} from "@/components/ui";
import { TradeBalances, TradeTicket, UserOrderRow } from "@/components/trade";
import { useWallet } from "@/contexts/WalletContext";
import {
  cancelDexOrder,
  fetchChainParams,
  fetchDexOrderbook,
  fetchPortfolio,
  matchDexOrder,
  placeDexOrder,
  type ChainParams,
  type DexOrderbook,
  type PortfolioData,
} from "@/lib/contracts";
import { ActionBar, FormField } from "@/components/ui";

function formatTtl(blocks: number, seconds: number): string {
  const mins = Math.round(seconds / 60);
  const blockLabel = `${blocks.toLocaleString("en-EU")} blocks`;
  if (mins <= 0) return blockLabel;
  if (mins < 60) return `${blockLabel} (~${mins} min)`;
  const hours = (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
  return `${blockLabel} (~${hours} h)`;
}

export default function DexPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [orderbook, setOrderbook] = useState<DexOrderbook | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [chainParams, setChainParams] = useState<ChainParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [book, params, port] = await Promise.all([
        fetchDexOrderbook(address ?? undefined, accountIndex),
        fetchChainParams(),
        address ? fetchPortfolio(address, accountIndex) : Promise.resolve(null),
      ]);
      setOrderbook(book);
      setChainParams(params);
      setPortfolio(port);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Could not load trade data.");
    } finally {
      setLoading(false);
    }
  }, [address, accountIndex]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const notify = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const placeOrder = async ({
    side,
    amount,
    limitPriceEur,
  }: {
    side: "buy" | "sell";
    amount: number;
    limitPriceEur?: number;
  }) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    setBusy(true);
    try {
      const result = await placeDexOrder(address, side, amount, limitPriceEur, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Order could not be placed.");
        return;
      }
      notify("success", "Private order commitment recorded.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Cancellation acts on a commitment by id. Reachable only if the orderbook
  // snapshot ever surfaces the caller's own orders (empty by design today).
  const cancelOrder = async (orderId: number) => {
    if (!address) return;
    setBusy(true);
    try {
      const result = await cancelDexOrder(address, orderId, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Cancel failed.");
        return;
      }
      notify("success", "Order commitment cancelled.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Advanced: take (match) a counterparty's resting private order. Matching is
  // a matcher/taker action keyed by the maker's ADDRESS (orders are private
  // commitments, so there is no public order to click). Settles atomically over
  // both parties' private balances via the token's authwit transfer.
  const [makerAddress, setMakerAddress] = useState("");
  const [fillAmount, setFillAmount] = useState("");

  const matchOrder = async () => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    if (!makerAddress.trim()) {
      notify("error", "Enter the counterparty (maker) address to match.");
      return;
    }
    setBusy(true);
    try {
      const fill = fillAmount.trim() ? Number(fillAmount) : undefined;
      const result = await matchDexOrder(address, makerAddress.trim(), fill, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Match failed.");
        return;
      }
      notify(
        "success",
        `Matched ${result.fillAmount ?? ""} ${fundSymbol} against the counterparty's resting order.`,
      );
      setMakerAddress("");
      setFillAmount("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const userOrders = orderbook?.userOrders ?? [];
  const canTrade = portfolio?.canTradeDex ?? false;
  const fundSymbol = portfolio?.fundTokenSymbol ?? "FSFT";
  const eurSymbol = portfolio?.eurTokenSymbol ?? "EUR";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Secondary liquidity"
        title="Transfer your position"
        description="A small, optional venue for moving Fund Share tokens between verified investors at a price tied to the fund’s net asset value. Most investors never need this — it is not where the fund is built."
        actions={
          <Button variant="secondary" size="sm" className="inline-flex" disabled={loading} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {loadError ? (
        <Alert tone="danger" title="Could not load trade data">
          {loadError}{" "}
          <button type="button" onClick={refresh} className="font-semibold underline">
            Retry
          </button>
        </Alert>
      ) : null}

      <div aria-live="polite">
        {msg ? (
          <Alert tone={msg.type === "success" ? "success" : "danger"}>{msg.text}</Alert>
        ) : null}
      </div>

      <KpiGrid cols={3}>
        {loading && !orderbook ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : orderbook ? (
          <>
            <KpiCard
              label="NAV reference price"
              value={`€${orderbook.priceReferenceEur.toFixed(4)}`}
              sub={`Per ${fundSymbol}, from net asset value`}
              tone="accent"
              hint="Trades are anchored to the fund’s net asset value per token, not an open market quote."
            />
            <KpiCard
              label="Allowed price band"
              value={`€${orderbook.priceBandMinEur.toFixed(4)}–€${orderbook.priceBandMaxEur.toFixed(4)}`}
              sub="Orders outside this band are rejected"
            />
            <KpiCard
              label="Max order lifetime"
              value={
                chainParams
                  ? formatTtl(chainParams.dex.maxTtlBlocks, chainParams.dex.maxTtlSecondsEstimate)
                  : "—"
              }
              sub="After expiry a commitment can no longer settle"
            />
          </>
        ) : null}
      </KpiGrid>

      <Alert tone="info" title="How secondary trades work here">
        Orders are <strong>private commitments</strong>, so there is no public order book to browse —
        you will not see other investors’ bids or offers, and they will not see yours. A trade settles
        directly over your <strong>private token balances</strong>: to <strong>buy</strong> {fundSymbol},
        you must shield {eurSymbol} into your private balance first; to <strong>sell</strong>, you need
        private {fundSymbol}. Every order is checked against the price band above and expires after its
        lifetime.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Place an order"
          description={`Record a private intent to buy or sell ${fundSymbol}. It settles only when a counter-order matches at a price inside the band.`}
        >
          {portfolio && orderbook ? (
            <TradeTicket
              fundSymbol={fundSymbol}
              eurSymbol={eurSymbol}
              priceReferenceEur={orderbook.priceReferenceEur}
              priceBandMinEur={orderbook.priceBandMinEur}
              priceBandMaxEur={orderbook.priceBandMaxEur}
              canTrade={canTrade}
              busy={busy}
              onPlace={placeOrder}
            />
          ) : !address ? (
            <EmptyState
              title="Connect a wallet to place orders"
              description="Secondary trades settle over your private balances, so a connected, verified investor account is required."
            />
          ) : (
            <p className="text-caption text-text-3">Loading…</p>
          )}
        </Section>

        <Section title="Your balances">
          {portfolio ? (
            <TradeBalances
              canTrade={canTrade}
              fundSymbol={fundSymbol}
              eurSymbol={eurSymbol}
              fsftBalance={portfolio.balance}
              eurBalance={portfolio.eurBalance}
              lockedEur={portfolio.lockedEur}
              lockedFsft={portfolio.lockedFsft}
            />
          ) : (
            <EmptyState
              title="No account connected"
              description="Connect a verified investor wallet to see the private balances that trades settle over."
            />
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Your orders">
          {userOrders.length ? (
            <div className="space-y-2">
              {userOrders.map((order) => (
                <UserOrderRow
                  key={order.id}
                  order={order}
                  fundSymbol={fundSymbol}
                  busy={busy}
                  onCancel={cancelOrder}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No order list to show"
              description="Because orders are private commitments, there is no list of your open intents to display here. Settlement happens privately over your balances once a counter-order matches."
            />
          )}
        </Section>

        <Section
          title="Match a resting order"
          description="Advanced · matcher. Settle against a counterparty's open private order by their address. Both sides settle over private balances, so you need private funds for your leg (shield first)."
        >
          {canTrade ? (
            <div className="space-y-3">
              <FormField label="Counterparty (maker) address" htmlFor="maker-address">
                <input
                  id="maker-address"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={makerAddress}
                  onChange={(e) => setMakerAddress(e.target.value)}
                  placeholder="0x…"
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-mono text-caption focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                />
              </FormField>
              <FormField label={`Fill amount (${fundSymbol})`} htmlFor="fill-amount" hint="Optional — defaults to the largest crossable size.">
                <input
                  id="fill-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={fillAmount}
                  onChange={(e) => setFillAmount(e.target.value)}
                  placeholder="Largest crossable…"
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-mono text-caption focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                />
              </FormField>
              <ActionBar>
                <Button variant="secondary" loading={busy} disabled={busy} onClick={matchOrder}>
                  Match order
                </Button>
              </ActionBar>
              <p className="text-caption text-text-3">
                Matched trades settle privately — there is no public record of recent matches under the
                private-intents model.
              </p>
            </div>
          ) : (
            <EmptyState
              title="Verified investors only"
              description="Matching a counterparty order requires a verified investor account."
            />
          )}
        </Section>
      </div>

      <p className="text-caption text-text-3">
        New to the fund? Building your position starts in the{" "}
        <Link href="/invest" className="text-fs-teal hover:underline">
          primary deposit flow
        </Link>
        , not here.
      </p>
    </div>
  );
}
