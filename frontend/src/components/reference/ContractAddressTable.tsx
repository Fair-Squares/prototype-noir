"use client";

import { DataTable, type Column } from "@/components/ui";
import { CopyButton } from "./CopyButton";

export interface ContractRow {
  /** Human label, e.g. "Housing Fund". */
  name: string;
  /** Env key the value came from, e.g. NEXT_PUBLIC_HOUSING_FUND_ADDRESS. */
  envKey: string;
  /** Full on-chain address (or "" when unset). */
  address: string;
  /** One-line role description. */
  role: string;
}

/** 0x12ab…cdef — keeps the head + tail, collapses the middle. */
function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const COLUMNS: Column<ContractRow>[] = [
  {
    key: "name",
    header: "Contract",
    render: (r) => (
      <div className="min-w-0">
        <div className="text-body text-text-1">{r.name}</div>
        <div className="text-caption text-text-3">{r.role}</div>
      </div>
    ),
  },
  {
    key: "envKey",
    header: "Env key",
    hideOnMobile: true,
    render: (r) => <span className="text-mono text-caption text-text-3">{r.envKey}</span>,
  },
  {
    key: "address",
    header: "Address",
    align: "right",
    render: (r) =>
      r.address ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-mono text-caption text-text-1" title={r.address}>
            {truncateMiddle(r.address)}
          </span>
          <CopyButton value={r.address} label={`Copy ${r.name} address`} />
        </div>
      ) : (
        <span className="text-caption text-text-3">Not deployed</span>
      ),
  },
];

/**
 * Dense explorer-style table of deployed contract instances. Addresses are
 * truncated in the middle (full value in the title attribute) with a copy
 * control; unset env keys render an honest "Not deployed" rather than a fake
 * zero address.
 */
export function ContractAddressTable({ rows }: { rows: ContractRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      dense
      rowKey={(r) => r.envKey}
      caption="Deployed contract instances and their on-chain addresses"
      empty={{
        title: "No contract addresses configured",
        description:
          "No NEXT_PUBLIC_*_ADDRESS values are set in this environment, so there is nothing to resolve.",
      }}
    />
  );
}
