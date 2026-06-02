import type { ReactNode } from "react";

export interface KpiGridProps {
  children: ReactNode;
  /** Number of columns at the largest breakpoint (1–4). Default 3. */
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

// Static class strings so Tailwind's compiler can see them (no dynamic concat
// of breakpoint:grid-cols-N tokens, which JIT would not pick up).
const COLS: Record<NonNullable<KpiGridProps["cols"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * Responsive grid wrapper for KpiCards. Collapses to a single column (or two,
 * for cols=4) on small screens.
 */
export function KpiGrid({ children, cols = 3, className }: KpiGridProps) {
  return (
    <div className={`grid gap-3 ${COLS[cols]} ${className ?? ""}`}>
      {children}
    </div>
  );
}
