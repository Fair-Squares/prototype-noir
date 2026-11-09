import { DataTable, type Column } from "@/components/ui";

export interface ParamRow {
  param: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}

const COLUMNS: Column<ParamRow>[] = [
  {
    key: "param",
    header: "Parameter",
    render: (r) => <span className="text-body text-text-1">{r.param}</span>,
  },
  {
    key: "value",
    header: "Value",
    align: "right",
    render: (r) => <span className="text-mono text-body text-text-1">{r.value}</span>,
  },
  {
    key: "note",
    header: "Notes",
    render: (r) => (r.note ? <span className="text-caption text-text-3">{r.note}</span> : null),
  },
];

/**
 * Generic parameter / value / note table. Values render in tabular figures so
 * columns of numbers line up. Used for chain timing, governance, and DEX limits.
 */
export function ParamTable({ rows, caption }: { rows: ParamRow[]; caption: string }) {
  return <DataTable columns={COLUMNS} rows={rows} dense rowKey={(r) => r.param} caption={caption} />;
}
