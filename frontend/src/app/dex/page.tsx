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
  InfoDot,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
  StatusChip,
  type Column,
} from "@/components/ui";
import { TradeBalances, TradeTicket } from "@/components/trade";
import { useWallet } from "@/contexts/WalletContext";
import { formatPctFromBps } from "@/lib/format";
import { logActivity } from "@/lib/sessionActivity";
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

/** §4.5 depth summary — one side of the book as a sentence, not a table. */
function DepthSummary({
  heading,
  orders,
  fundSymbol,
  bestLabel,
  emptyText,
}: {
  heading: string;
  orders: DexOrder[];
  fundSymbol: string;
  bestLabel: string;
  emptyText: string;
}) {
  const open = orders.filter((o) => o.remaining > 0);
  const best = open[0] ?? null; // book arrives best-price-first
  const totalShares = open.reduce((sum, o) => sum + o.remaining, 0);
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <p className="text-label">{heading}</p>
      {best ? (
        <p className="text-body mt-1 text-text-1">
          {bestLabel} <span className="text-mono">€{best.priceEur.toFixed(4)}</span>{" "}
          <span className="text-caption text-text-2">
            · {totalShares.toLocaleString("en-US")} {fundSymbol} across {open.length}{" "}
            {open.length === 1 ? "order" : "orders"}
          </span>
        </p>
      ) : (
        <p className="text-caption mt-1 text-text-3">{emptyText}</p>
      )}
    </div>
  );
}

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
      logActivity(
        address,
        "order",
        `Placed a ${side} order for ${amount.toLocaleString("en-US")} shares`
      );
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
      if (result.success) {
        logActivity(address, "order", result.message ?? fallback.ok);
        await refresh();
      }
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : fallback.fail);
    } finally {
      setBusySeq(null);
    }
  };

  const cancelOrder = (seq: number) =>
    runOrderAction(seq, (addr) => cancelDexOrder(addr, seq, accountIndex), { ok: "Order cancelled — your unfilled amount is now claimable below.", fail: "Cancel failed." });

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
        eyebrow="Secondary market"
        title="Trade shares"
        description="Move fund shares to another verified investor. Optional — most people never need it."
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

      {/* §4.5: ONE price concept — the reference price leads; the band is a
          guardrail sentence under it, not a standalone stat. */}
      {loading && !orderbook ? (
        <KpiGrid cols={1}>
          <SkeletonKpi />
        </KpiGrid>
      ) : orderbook ? (
        <section className="surface p-5">
          <div className="flex items-center gap-1.5">
            <span className="text-label">Reference price</span>
            <InfoDot
              label="About the reference price"
              content="The price recorded at the most recent share issuance — NOT current NAV per share, and not an open-market quote. Every order must stay near it."
            />
          </div>
          <p className="text-display text-text-1">
            €{orderbook.priceReferenceEur.toFixed(4)}
            <span className="text-caption ml-2 text-text-3">per {fundSymbol} · last issue price</span>
          </p>
          <p className="text-caption mt-2 text-text-2">
            Orders must stay between{" "}
            <span className="text-mono">€{orderbook.priceBandMinEur.toFixed(4)}</span> and{" "}
            <span className="text-mono">€{orderbook.priceBandMaxEur.toFixed(4)}</span>
            {chainParams ? ` (±${formatPctFromBps(chainParams.dex.priceBandBps)})` : ""} — so
            prices stay tied to the value of the homes, and every trader is a
            verified investor.
          </p>
        </section>
      ) : null}

      <AdvancedDetails summary="How secondary trading works">
        <div className="space-y-2">
          <p className="text-body text-text-2">
            The order book below is <strong>public</strong>, but <strong>who</strong> posted each order is not —
            orders carry no owner on chain. Matching is <strong>automatic, on-chain</strong>: when you place an
            order that crosses a resting one at the same price, it settles in the same transaction (no bot, no
            waiting). Settlement is over <strong>private balances</strong> — buying uses the private part of your
            {eurSymbol} (the app moves the needed amount there for you when you place an order); selling uses
            your private {fundSymbol}.
            Proceeds accrue to your order and you <strong>claim</strong> them from <strong>Your orders</strong> below.
          </p>
          {chainParams ? (
            <p className="text-caption text-text-3">
              Orders rest for at most{" "}
              {formatTtl(chainParams.dex.maxTtlBlocks, chainParams.dex.maxTtlSecondsEstimate)} — after
              expiry an order can no longer settle and its funds become claimable.
            </p>
          ) : null}
        </div>
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
            <EmptyState title="No account connected" description="Connect a wallet to see your balances." />
          )}
        </Section>
      </div>

      {/* §4.5: depth summary first — a reader who has never seen an order
          book gets best-price/size/count sentences; the full public book is
          one disclosure away. Orders are anonymous — nobody can see who is
          trading. */}
      <Section
        title="Open interest"
        description="What other investors are offering right now. Orders are anonymous — nobody can see who is trading."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DepthSummary
            heading="Buyers"
            orders={orderbook?.buyOrders ?? []}
            fundSymbol={fundSymbol}
            bestLabel="Best bid"
            emptyText="No one is bidding for shares right now."
          />
          <DepthSummary
            heading="Sellers"
            orders={orderbook?.sellOrders ?? []}
            fundSymbol={fundSymbol}
            bestLabel="Best ask"
            emptyText="No shares are offered for sale right now."
          />
        </div>
        <AdvancedDetails summary="Full order book" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-label mb-2">Bids — buying {fundSymbol}</p>
              <DataTable columns={orderColumns} rows={orderbook?.buyOrders ?? []} dense empty={{ title: "No buy orders", description: "No one is bidding for shares right now." }} />
            </div>
            <div>
              <p className="text-label mb-2">Asks — selling {fundSymbol}</p>
              <DataTable columns={orderColumns} rows={orderbook?.sellOrders ?? []} dense empty={{ title: "No sell orders", description: "No shares are offered for sale right now." }} />
            </div>
          </div>
        </AdvancedDetails>
      </Section>

      <Section
        title="Your orders"
        description="Cancel to get your unfilled amount back, or claim what a match left you. Only you can see these."
      >
        {!address ? (
          <EmptyState title="Connect a wallet" description="Connect a verified investor account to see your orders." />
        ) : !canTrade ? (
          <EmptyState title="Verified investors only" description="Trading requires a verified investor account." />
        ) : loading && myOrders.length === 0 ? (
          <p className="text-caption text-text-3">Scanning your orders…</p>
        ) : myOrders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders you place show up here automatically." />
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
                            Cancelling returns your unfilled amount to your claimable balance.
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
        <Link href="/portfolio#deposit" className="text-fs-teal-dark underline underline-offset-2">primary deposit flow</Link>, not here.
      </p>
    </div>
  );
}
