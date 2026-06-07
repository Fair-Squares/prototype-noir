export interface LoadingSkeletonProps {
  /** Number of placeholder lines. Default 3. */
  lines?: number;
  className?: string;
}

const BAR = "h-3 rounded skeleton-bar animate-pulse";

/**
 * Calm multi-line text placeholder. Uses a low-key opacity pulse (no shimmer
 * sweep). The last line is shortened to read as a paragraph tail.
 */
export function LoadingSkeleton({ lines = 3, className }: LoadingSkeletonProps) {
  return (
    <div
      className={`flex flex-col gap-2 ${className ?? ""}`}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={BAR}
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** KPI-tile placeholder: a label bar + a large value bar inside a muted card. */
export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div
      className={`surface-muted p-4 ${className ?? ""}`}
      role="status"
      aria-label="Loading metric"
    >
      <div className="mb-3 h-2.5 w-20 rounded skeleton-bar animate-pulse" />
      <div className="h-7 w-28 rounded skeleton-bar animate-pulse" />
    </div>
  );
}

export interface SkeletonRowProps {
  /** Number of cell placeholders across the row. Default 4. */
  cols?: number;
  className?: string;
}

/** Single horizontal row of cell placeholders, for table loading states. */
export function SkeletonRow({ cols = 4, className }: SkeletonRowProps) {
  return (
    <div
      className={`flex items-center gap-3 py-3 ${className ?? ""}`}
      role="status"
      aria-label="Loading row"
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="h-3 flex-1 rounded skeleton-bar animate-pulse"
        />
      ))}
    </div>
  );
}
