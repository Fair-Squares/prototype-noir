import type { ReactNode } from "react";

export interface AdvancedDetailsProps {
  /** Summary label. Default "Advanced details". */
  summary?: string;
  /** Disclosure body — raw on-chain data, formulas, addresses, etc. */
  children: ReactNode;
  /** Render expanded on first paint. Default false (opt-in). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Opt-in progressive-disclosure wrapper around a native `<details>`. Use to
 * tuck dense / advanced material (note commitments, block heights, contract
 * addresses, formulas) below the calm primary flow. Native element keeps it
 * keyboard-accessible and deep-linkable without JS.
 */
export function AdvancedDetails({
  summary = "Advanced details",
  children,
  defaultOpen = false,
  className,
}: AdvancedDetailsProps) {
  return (
    <details className={`surface group p-0 ${className ?? ""}`} open={defaultOpen}>
      <summary className="text-label flex cursor-pointer list-none items-center justify-between px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]">
        <span>{summary}</span>
        <span
          aria-hidden="true"
          className="text-text-3 transition-transform group-open:rotate-180"
        >
          v
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}
