import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export type ColumnAlign = "left" | "right" | "center";

export interface Column<Row> {
  /** Unique key; also used to read `row[key]` when no `render` is given. */
  key: string;
  header: ReactNode;
  align?: ColumnAlign;
  /** Custom cell renderer. Receives the full row and its index. */
  render?: (row: Row, index: number) => ReactNode;
  /** Hide this column from the stacked mobile card view. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Shown (as an EmptyState) when `rows` is empty. */
  empty?: { title: string; description?: ReactNode } | ReactNode;
  /** Tighter row padding for data-dense tables. */
  dense?: boolean;
  /** Stable key per row; defaults to the row index. */
  rowKey?: (row: Row, index: number) => string | number;
  className?: string;
  /** Accessible caption for the table (visually hidden). */
  caption?: string;
}

const ALIGN_TEXT: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function cellValue<Row>(col: Column<Row>, row: Row, index: number): ReactNode {
  if (col.render) return col.render(row, index);
  // Fallback: read the column key off the row as a primitive.
  const raw = (row as Record<string, unknown>)[col.key];
  return raw as ReactNode;
}

/**
 * Responsive data table. Renders a real <table> at the sm breakpoint and above,
 * and a stack of labeled cards below it (one card per row, each cell shown as a
 * label/value pair). Falls back to an EmptyState when there are no rows.
 *
 * Generic over the row shape; `columns[].render` gives full control over cells.
 */
export function DataTable<Row>({
  columns,
  rows,
  empty,
  dense = false,
  rowKey,
  className,
  caption,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    if (empty == null) {
      return (
        <EmptyState
          title="Nothing to show"
          description="There are no records to display yet."
        />
      );
    }
    // Object form -> render via EmptyState; otherwise treat as a custom node.
    if (
      typeof empty === "object" &&
      empty !== null &&
      "title" in (empty as Record<string, unknown>)
    ) {
      const e = empty as { title: string; description?: ReactNode };
      return <EmptyState title={e.title} description={e.description} />;
    }
    return <>{empty as ReactNode}</>;
  }

  const cellPad = dense ? "px-3 py-2" : "px-3 py-3";
  const key = (row: Row, i: number) => (rowKey ? rowKey(row, i) : i);
  const mobileCols = columns.filter((c) => !c.hideOnMobile);

  return (
    <div className={className}>
      {/* Desktop / tablet: real table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`text-label ${cellPad} ${ALIGN_TEXT[col.align ?? "left"]}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={key(row, i)}
                className="border-b border-border last:border-b-0 hover:bg-card-hover"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`text-body ${cellPad} text-text-1 ${ALIGN_TEXT[col.align ?? "left"]}`}
                  >
                    {cellValue(col, row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked label/value cards */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((row, i) => (
          <li key={key(row, i)} className="surface-muted p-4">
            <dl className="flex flex-col gap-2">
              {mobileCols.map((col) => (
                <div
                  key={col.key}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-label flex-shrink-0">{col.header}</dt>
                  <dd className="text-body min-w-0 text-right text-text-1">
                    {cellValue(col, row, i)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
