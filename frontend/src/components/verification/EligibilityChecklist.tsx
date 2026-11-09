import type { ReactNode } from "react";
import { ProofChip, type ProofState } from "@/components/ui";

export interface ChecklistItem {
  /** Short, plain-language name of the readiness item. */
  label: string;
  /** Resolved proof state — drives the chip color + screen-reader word. */
  state: ProofState;
  /** One-sentence explanation of what this item means, in plain terms. */
  explanation: ReactNode;
  /** What the investor (or the protocol) does next when this isn't satisfied. */
  nextStep?: ReactNode;
}

export interface EligibilityChecklistProps {
  items: ChecklistItem[];
  className?: string;
}

/**
 * Vertical readiness checklist for the verification page. Each row is a single
 * readiness item: a status chip, a plain-language explanation, and — when the
 * item isn't satisfied — a short next step. Presentational only; the parent
 * resolves each item's state from real on-chain profile + eligibility data.
 */
export function EligibilityChecklist({ items, className }: EligibilityChecklistProps) {
  return (
    <ul className={`flex flex-col divide-y divide-border ${className ?? ""}`}>
      {items.map((item) => {
        const satisfied = item.state === "ok";
        return (
          <li key={item.label} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex-shrink-0 sm:w-52">
              <ProofChip label={item.label} state={item.state} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption text-text-2">{item.explanation}</p>
              {!satisfied && item.nextStep ? (
                <p className="text-caption mt-1 text-text-3">{item.nextStep}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
