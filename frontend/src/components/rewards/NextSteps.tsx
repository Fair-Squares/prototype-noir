import type { ReactNode } from "react";

export interface NextStepsProps {
  steps: string[];
  /** Optional trailing node (e.g. a link to improve eligibility). */
  footer?: ReactNode;
}

/**
 * Plain-language guidance list. Renders the `nextSteps` array the rewards API
 * returns verbatim — no invented copy. Calm numbered list, not a marketing CTA.
 */
export function NextSteps({ steps, footer }: NextStepsProps) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={`${i}-${step}`} className="flex gap-3">
            <span
              aria-hidden="true"
              className="text-meta tabular-nums text-text-3 mt-0.5 w-5 flex-shrink-0 text-right"
            >
              {i + 1}.
            </span>
            <span className="text-body text-text-2">{step}</span>
          </li>
        ))}
      </ol>
      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
