"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionBar,
  AdvancedDetails,
  Alert,
  Button,
  DataTable,
  EmptyState,
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
  fetchMyDexOrders,
  fetchPortfolio,
  placeDexOrder,
  type ChainParams,
  type DexOrder,
  type DexOrderbook,
  type MyDexOrder,
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
  const [myOrders, setMyOrders] = useState<MyDexOrder[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-order in-flight action (keyed by seq) so each row's buttons spin alone.
  const [busySeq, setBusySeq] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Two-step confirm for the destructive "cancel order" action.
  const [confirmCancelSeq, setConfirmCancelSeq] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monotonic token so a slow in-flight load for a previous account can never
  // overwrite the newly selected account's data (account-switch race).
  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setLoading(true);
    try {
      const [book, params, port, mine] = await Promise.all([
        fetchDexOrderbook(address ?? undefined, accountIndex),
        fetchChainParams(),
        address ? fetchPortfolio(address, accountIndex) : Promise.resolve(null),
        address ? fetchMyDexOrders(address, accountIndex) : Promise.resolve([]),
      ]);
      if (seq !== refreshSeqRef.current) return;
      setOrderbook(book);
      setChainParams(params);
      setPortfolio(port);
      setMyOrders(mine);
      setLoadError(null);
    } catch (error: unknown) {
      if (seq !== refreshSeqRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Could not load trade data.");
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  }, [address, accountIndex]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = (type: "success" | "error", text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMsg({ type, text });
    if (type === "success") {
      toastTimer.current = setTimeout(() => setMsg(null), 8000);
    }
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
      // The placement matches on-chain if it crosses; otherwise it rests — it
      // shows up under "Your orders" below, no number to remember.
      notify("success", result.message ?? "Order placed.");
      await refresh();
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Order could not be placed.");
    } finally {
      setBusy(false);
    }
  };

  // Per-order actions on a scanned order. The seq is carried from the order the
  // user clicked — never typed. Each runs against the owner's own OrderOwnerNote.
  const runOrderAction = async (
    seq: number,
    action: (addr: string) => Promise<{ success: boolean; message?: string; error?: string }>,
    fallback: { ok: string; fail: string }
  ) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    setBusySeq(seq);
    try {
      const result = await action(address);
      notify(result.success ? "success" : "error", result.success ? (result.message ?? fallback.ok) : (result.error ?? fallback.fail));
      if (result.success) await refresh();
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : fallback.fail);
    } finally {
      setBusySeq(null);
    }
  };

  const cancelOrder = (seq: number) =>
    runOrderAction(seq, (addr) => cancelDexOrder(addr, seq, accountIndex), { ok: "Order cancelled — unfilled escrow moved to your claimable balance.", fail: "Cancel failed." });

  const claim = (seq: number, token: "eur" | "fsft") =>
    runOrderAction(seq, (addr) => claimDexProceeds(addr, seq, token, accountIndex), { ok: "Claimed to your private balance.", fail: "Nothing to claim." });

  const canTrade = portfolio?.canTradeDex ?? false;
  const fundSymbol = portfolio?.fundTokenSymbol ?? "FSFT";
  const eurSymbol = portfolio?.eurTokenSymbol ?? "EUR";

  const orderColumns: Column<DexOrder>[] = [
    { key: "priceEur", header: "Price", align: "right", render: (o) => <span className="text-mono">€{o.priceEur.toFixed(4)}</span> },
    { key: "remaining", header: `Open (${fundSymbol})`, align: "right", render: (o) => <span className="text-mono">{o.remaining.toLocaleString("en-EU")}</span> },
    { key: "status", header: "Status", render: (o) => <StatusChip status={STATUS_KIND[o.status as keyof typeof STATUS_KIND] ?? "open"} label={o.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Secondary liquidity"
        title="Transfer your position"
        description="A small, optional venue for moving Fund Share tokens between verified investors at a price bounded around the last issuance reference price. Most investors never need this - it is not where the fund is built."
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

      {msg ? <Alert tone={msg.type === "success" ? "success" : "danger"}>{msg.text}</Alert> : null}

      <KpiGrid cols={3}>
        {loading && !orderbook ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : orderbook ? (
          <>
            <KpiCard label="Last issuance reference price" value={`€${orderbook.priceReferenceEur.toFixed(4)}`} sub={`Per ${fundSymbol}, from the most recent asset distribution`} tone="accent" hint="The reference used to bound orders. It is the token price recorded at the most recent asset distribution — NOT current NAV per share, and not an open-market quote." />
            <KpiCard label="Allowed price band" value={`€${orderbook.priceBandMinEur.toFixed(4)}`} sub={`to €${orderbook.priceBandMaxEur.toFixed(4)} · indicative reference guardrail`} />
            <KpiCard label="Max order lifetime" value={chainParams ? formatTtl(chainParams.dex.maxTtlBlocks, chainParams.dex.maxTtlSecondsEstimate) : "-"} sub="After expiry an order can no longer settle" />
          </>
        ) : null}
      </KpiGrid>

      <AdvancedDetails summary="How secondary trading works">
        <p className="text-body text-text-2">
          The order book below is <strong>public</strong>, but <strong>who</strong> posted each order is not —
          orders carry no owner on chain. Matching is <strong>automatic, on-chain</strong>: when you place an
          order that crosses a resting one at the same price, it settles in the same transaction (no bot, no
          waiting). Settlement is over <strong>private balances</strong> — buying uses the private part of your
          {eurSymbol} (the app moves the needed amount there for you when you place an order); selling uses
          your private {fundSymbol}.
          Proceeds accrue to your order and you <strong>claim</strong> them from <strong>Your orders</strong> below.
        </p>
      </AdvancedDetails>

      <p className="text-caption text-text-3">
        Liquidity here can be thin — an order only matches when another member crosses your price, so it may rest
        unfilled. The reference price is the last issuance price, not a live market quote.
      </p>

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

      <Section
        title="Your orders"
        description="Your own orders, found automatically — cancel one to reclaim unfilled escrow, or claim proceeds a match left for you. Only you can see these."
      >
        {!address ? (
          <EmptyState title="Connect a wallet" description="Connect a verified investor account to see your orders." />
        ) : !canTrade ? (
          <EmptyState title="Verified investors only" description="Trading requires a verified investor account." />
        ) : loading && myOrders.length === 0 ? (
          <p className="text-caption text-text-3">Scanning your orders…</p>
        ) : myOrders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders you place show up here automatically — no reference number to keep." />
        ) : (
          <div className="space-y-3">
            {myOrders.map((o) => {
              const rowBusy = busySeq === o.seq;
              const hasEur = o.claimableEur > 0;
              const hasFsft = o.claimableFsft > 0;
              return (
                <div key={o.seq} className="rounded-md border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-body font-semibold text-text-1">
                        {o.side === "buy" ? "Buy" : "Sell"} {o.amount.toLocaleString("en-EU")} {fundSymbol}
                      </span>
                      <span className="text-caption text-text-2">at €{o.priceEur.toFixed(4)}</span>
                      <StatusChip status={STATUS_KIND[o.status] ?? "open"} label={o.status} />
                    </div>
                    <span className="text-caption text-text-3">
                      {o.remaining.toLocaleString("en-EU")} {fundSymbol} unfilled
                    </span>
                  </div>

                  {(hasEur || hasFsft) ? (
                    <p className="text-caption mt-2 text-text-2">
                      Claimable:{" "}
                      {hasEur ? <span className="text-mono">€{o.claimableEur.toLocaleString("en-EU")}</span> : null}
                      {hasEur && hasFsft ? " · " : null}
                      {hasFsft ? <span className="text-mono">{o.claimableFsft.toLocaleString("en-EU")} {fundSymbol}</span> : null}
                    </p>
                  ) : null}

                  <ActionBar align="start" className="mt-3">
                    {hasEur ? (
                      <Button variant="secondary" size="sm" loading={rowBusy} disabled={rowBusy} onClick={() => claim(o.seq, "eur")}>
                        Claim €{o.claimableEur.toLocaleString("en-EU")}
                      </Button>
                    ) : null}
                    {hasFsft ? (
                      <Button variant="secondary" size="sm" loading={rowBusy} disabled={rowBusy} onClick={() => claim(o.seq, "fsft")}>
                        Claim {o.claimableFsft.toLocaleString("en-EU")} {fundSymbol}
                      </Button>
                    ) : null}
                    {o.cancellable ? (
                      confirmCancelSeq === o.seq ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={rowBusy}
                            disabled={rowBusy}
                            onClick={() => {
                              setConfirmCancelSeq(null);
                              cancelOrder(o.seq);
                            }}
                          >
                            Confirm cancel
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => setConfirmCancelSeq(null)}
                          >
                            Keep order
                          </Button>
                          <span className="text-caption text-text-3">
                            Cancelling frees your unfilled escrow back to claimable.
                          </span>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={rowBusy}
                          onClick={() => setConfirmCancelSeq(o.seq)}
                        >
                          Cancel order
                        </Button>
                      )
                    ) : null}
                    {!hasEur && !hasFsft && !o.cancellable ? (
                      <span className="text-caption text-text-3">Nothing to do — fully settled.</span>
                    ) : null}
                  </ActionBar>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <p className="text-caption text-text-3">
        New to the fund? Building your position starts in the{" "}
        <Link href="/portfolio#deposit" className="text-fs-teal hover:underline">primary deposit flow</Link>, not here.
      </p>
    </div>
  );
}
