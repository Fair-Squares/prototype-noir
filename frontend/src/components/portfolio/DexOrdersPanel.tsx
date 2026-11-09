"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, DataTable, EmptyState, Section, StatusChip, type Column } from "@/components/ui";
import {
  fetchMyDexOrders,
  formatEUR,
  formatFSFT,
  type MyDexOrder,
} from "@/lib/contracts";

export interface DexOrdersPanelProps {
  address: string;
  accountIndex: number;
}

const ORDER_CHIP: Record<MyDexOrder["status"], { status: "open" | "pending" | "completed" | "failed" | "delayed"; label: string }> = {
  open: { status: "open", label: "Open" },
  partial: { status: "pending", label: "Partially filled" },
  filled: { status: "completed", label: "Filled" },
  cancelled: { status: "failed", label: "Cancelled" },
  expired: { status: "delayed", label: "Expired" },
};

/**
 * J6: the account's DEX orders inside the portfolio, self-contained — the
 * fetch failing (e.g. trading disabled on this deployment) degrades to an
 * inline error in this section, never a broken portfolio. Claim/cancel stay on
 * /dex; this is the overview.
 */
export function DexOrdersPanel({ address, accountIndex }: DexOrdersPanelProps) {
  const [orders, setOrders] = useState<MyDexOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setOrders(null);
    setError(null);
    fetchMyDexOrders(address, accountIndex)
      .then((next) => {
        if (active) setOrders(next);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [address, accountIndex]);

  const columns: Column<MyDexOrder>[] = [
    {
      key: "side",
      header: "Order",
      render: (row) => (
        <span className="font-semibold">
          {row.side === "buy" ? "Buy" : "Sell"} {formatFSFT(row.amount)}
        </span>
      ),
    },
    {
      key: "priceEur",
      header: "Price",
      align: "right",
      render: (row) => <span className="text-mono">{formatEUR(row.priceEur)}</span>,
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      hideOnMobile: true,
      render: (row) => <span className="text-mono">{formatFSFT(row.remaining)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const chip = ORDER_CHIP[row.status];
        return <StatusChip status={chip.status} label={chip.label} />;
      },
    },
    {
      key: "claimable",
      header: "Claimable",
      align: "right",
      render: (row) =>
        row.claimableEur > 0 || row.claimableFsft > 0 ? (
          <span className="text-mono font-semibold">
            {row.claimableEur > 0 ? formatEUR(row.claimableEur) : formatFSFT(row.claimableFsft)}
          </span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
  ];

  return (
    <Section
      title="Your trades"
      description="Orders you placed on the anonymous order book, with anything claimable from fills."
      actions={
        <Link href="/dex" className="btn btn-ghost btn-sm">
          Open trading
        </Link>
      }
    >
      {error ? (
        <Alert tone="warning" title="Trades unavailable">
          {error}
        </Alert>
      ) : orders === null ? (
        <p className="text-caption text-text-2">Scanning your orders…</p>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders you place on the trading page appear here with their fill status and claimable proceeds."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(row) => row.seq}
          caption="Your DEX orders"
          dense
        />
      )}
    </Section>
  );
}
