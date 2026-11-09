import type { ReactNode } from "react";
import { ProofChip, type ProofState } from "./ProofChip";

export interface ProofRailItem {
  label: string;
  state: ProofState;
  /** Optional one-line explanation shown under the chip. */
  hint?: ReactNode;
}

export interface ProofRailProps {
  items: ProofRailItem[];
  /** Optional title for the rail. Default "Trust rail". */
  title?: string;
  /** Footer slot, e.g. "Data fresh as of block 1,234". */
  freshAs?: ReactNode;
  className?: string;
}

function RailBody({ items, freshAs }: Pick<ProofRailProps, "items" | "freshAs">) {
  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col gap-1">
            <ProofChip label={item.label} state={item.state} />
            {item.hint ? (
              <p className="text-caption text-text-3">{item.hint}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {freshAs ? (
        <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">
          {freshAs}
        </p>
      ) : null}
    </>
  );
}

/**
 * Trust rail. PRESENTATIONAL ONLY — the parent passes resolved `items`; this
 * component never fetches. Renders as a fixed vertical panel on desktop
 * (intended for a right rail) and as a collapsible <details> strip on mobile.
 * `freshAs` fills the "Data fresh as of <block/time>" footer slot.
 */
export function ProofRail({
  items,
  title = "Trust rail",
  freshAs,
  className,
}: ProofRailProps) {
  return (
    <div className={className}>
      {/* Desktop: open panel */}
      <aside
        className="surface hidden p-4 lg:block"
        aria-label={title}
      >
        <p className="text-label mb-3">{title}</p>
        <RailBody items={items} freshAs={freshAs} />
      </aside>

      {/* Mobile / tablet: collapsible strip */}
      <details className="surface group p-0 lg:hidden">
        <summary className="text-label flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span>{title}</span>
          <span
            aria-hidden="true"
            className="text-text-3 transition-transform group-open:rotate-180"
          >
            v
          </span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          <RailBody items={items} freshAs={freshAs} />
        </div>
      </details>
    </div>
  );
}
