"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ActionBar,
  Alert,
  Button,
  DataTable,
  EmptyState,
  FormField,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
  StatusChip,
  type Column,
} from "@/components/ui";
import { TradeBalances, TradeTicket } from "@/components/trade";
import { useWallet } from "@/contexts/WalletContext";
import {
  cancelDexOrder,
  claimDexProceeds,
  fetchChainParams,
  fetchDexOrderbook,
  fetchPortfolio,
  placeDexOrder,
  type ChainParams,
  type DexOrder,
  type DexOrderbook,
  type PortfolioData,
} from "@/lib/contracts";

function formatTtl(blocks: number, seconds: number): string {
  const mins = Math.round(seconds / 60);
  const blockLabel = `${blocks.toLocaleString("en-EU")} blocks`;
  if (mins <= 0) return blockLabel;
  if (mins < 60) return `${blockLabel} (~${mins} min)`;
  const hours = (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
  return `${blockLabel} (~${hours} h)`;
}

const STATUS_KIND = {
  open: "open", partial: "pending", filled: "completed", cancelled: "blocked", expired: "delayed",
} as const;

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
  const [manageSeq, setManageSeq] = useState("");

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
    if (type === "success") setTimeout(() => setMsg(null), 8000);
  };

  const placeOrder = async ({ side, amount, limitPriceEur }: { side: "buy" | "sell"; amount: number; limitPriceEur?: number }) => {
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
      // The placement matches on-chain if it crosses; otherwise it rests.
      const seq = (result as { seq?: number }).seq;
      notify("success", `${result.message ?? "Order placed."}${seq !== undefined ? ` (your order seq: ${seq})` : ""}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // cancel + claim share the same shape: guard on seq, run the action, surface
  // the result, refresh on success. Only the call and the default copy differ.
  const runManage = async (
    action: (addr: string) => Promise<{ success: boolean; message?: string; error?: string }>,
    fallback: { ok: string; fail: string }
  ) => {
    if (!address || !manageSeq.trim()) {
      notify("error", "Enter your order's seq number.");
      return;
    }
    setBusy(true);
    try {
      const result = await action(address);
      notify(result.success ? "success" : "error", result.success ? (result.message ?? fallback.ok) : (result.error ?? fallback.fail));
      if (result.success) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = () =>
    runManage((addr) => cancelDexOrder(addr, Number(manageSeq), accountIndex), { ok: "Cancelled.", fail: "Cancel failed." });

  const claim = (token: "eur" | "fsft") =>
    runManage((addr) => claimDexProceeds(addr, Number(manageSeq), token, accountIndex), { ok: "Claimed.", fail: "Nothing to claim." });

  const canTrade = portfolio?.canTradeDex ?? false;
  const fundSymbol = portfolio?.fundTokenSymbol ?? "FSFT";
  const eurSymbol = portfolio?.eurTokenSymbol ?? "EUR";

  const orderColumns: Column<DexOrder>[] = [
    { key: "priceEur", header: "Price", align: "right", render: (o) => <span className="text-mono">€{o.priceEur.toFixed(4)}</span> },
    { key: "remaining", header: `Open (${fundSymbol})`, align: "right", render: (o) => <span className="text-mono">{o.remaining.toLocaleString("en-EU")}</span> },
    { key: "id", header: "Seq", align: "right", render: (o) => <span className="text-mono text-text-3">#{o.id}</span> },
    { key: "status", header: "Status", render: (o) => <StatusChip status={STATUS_KIND[o.status as keyof typeof STATUS_KIND] ?? "open"} label={o.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Secondary liquidity"
        title="Transfer your position"
        description="A small, optional venue for moving Fund Share tokens between verified investors at a price tied to the fund's net asset value. Most investors never need this - it is not where the fund is built."
        actions={
          <Button variant="secondary" size="sm" className="inline-flex" disabled={loading} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {loadError ? (
        <Alert tone="danger" title="Could not load trade data">
          {loadError}{" "}
          <button type="button" onClick={refresh} className="font-semibold underline">Retry</button>
        </Alert>
      ) : null}

      <div aria-live="polite">
        {msg ? <Alert tone={msg.type === "success" ? "success" : "danger"}>{msg.text}</Alert> : null}
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
            <KpiCard label="NAV reference price" value={`€${orderbook.priceReferenceEur.toFixed(4)}`} sub={`Per ${fundSymbol}, from net asset value`} tone="accent" hint="Trades anchor to the fund's net asset value per token, not an open-market quote." />
            <KpiCard label="Allowed price band" value={`€${orderbook.priceBandMinEur.toFixed(4)}-€${orderbook.priceBandMaxEur.toFixed(4)}`} sub="Indicative NAV guardrail" />
            <KpiCard label="Max order lifetime" value={chainParams ? formatTtl(chainParams.dex.maxTtlBlocks, chainParams.dex.maxTtlSecondsEstimate) : "-"} sub="After expiry an order can no longer settle" />
          </>
        ) : null}
      </KpiGrid>

      <Alert tone="info" title="How secondary trades work here">
        The order book below is <strong>public</strong>, but <strong>who</strong> posted each order is not -
        orders carry no owner on chain. Matching is <strong>automatic, on-chain</strong>: when you place an
        order that crosses a resting one at the same price, it settles in the same transaction (no bot, no
        waiting). Settlement is over <strong>private balances</strong> - to <strong>buy</strong> {fundSymbol} you
        must shield {eurSymbol} into your private balance first; to <strong>sell</strong> you need private {fundSymbol}.
        Proceeds accrue to your order and you <strong>claim</strong> them with your order's seq number.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Place an order" description={`Buy or sell ${fundSymbol}. If it crosses a resting order at the same price it matches on-chain immediately; otherwise it rests in the book.`}>
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
            <EmptyState title="Connect a wallet to place orders" description="Secondary trades settle over your private balances, so a connected, verified investor account is required." />
          ) : (
            <p className="text-caption text-text-3">Loading...</p>
          )}
        </Section>

        <Section title="Your balances">
          {portfolio ? (
            <TradeBalances canTrade={canTrade} fundSymbol={fundSymbol} eurSymbol={eurSymbol} fsftBalance={portfolio.balance} eurBalance={portfolio.eurBalance} lockedEur={portfolio.lockedEur} lockedFsft={portfolio.lockedFsft} />
          ) : (
            <EmptyState title="No account connected" description="Connect a verified investor wallet to see the private balances that trades settle over." />
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Bids - buying ${fundSymbol}`} description="Resting buy orders (best price first). Owners are anonymous.">
          <DataTable columns={orderColumns} rows={orderbook?.buyOrders ?? []} dense empty={{ title: "No buy orders", description: "No one is bidding for shares right now." }} />
        </Section>
        <Section title={`Asks - selling ${fundSymbol}`} description="Resting sell orders (best price first). Owners are anonymous.">
          <DataTable columns={orderColumns} rows={orderbook?.sellOrders ?? []} dense empty={{ title: "No sell orders", description: "No shares are offered for sale right now." }} />
        </Section>
      </div>

      <Section title="Manage your order" description="The book is anonymous, so manage an order by the seq number you got when you placed it. Cancel reclaims unfilled escrow; claim withdraws matched proceeds to your private balance.">
        {canTrade ? (
          <div className="space-y-3">
            <FormField label="Your order seq" htmlFor="manage-seq" hint="The number returned when you placed the order.">
              <input
                id="manage-seq"
                type="number"
                inputMode="numeric"
                min={0}
                value={manageSeq}
                onChange={(e) => setManageSeq(e.target.value)}
                placeholder="e.g. 3"
                className="w-40 rounded-md border border-border bg-card px-3 py-2 text-mono text-caption focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              />
            </FormField>
            <ActionBar align="start">
              <Button variant="secondary" size="sm" loading={busy} disabled={busy} onClick={() => claim("eur")}>Claim {eurSymbol}</Button>
              <Button variant="secondary" size="sm" loading={busy} disabled={busy} onClick={() => claim("fsft")}>Claim {fundSymbol}</Button>
              <Button variant="danger" size="sm" loading={busy} disabled={busy} onClick={cancelOrder}>Cancel order</Button>
            </ActionBar>
          </div>
        ) : (
          <EmptyState title="Verified investors only" description="Trading requires a verified investor account." />
        )}
      </Section>

      <p className="text-caption text-text-3">
        New to the fund? Building your position starts in the{" "}
        <Link href="/invest" className="text-fs-teal hover:underline">primary deposit flow</Link>, not here.
      </p>
    </div>
  );
}
