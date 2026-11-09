import type { ReactNode } from "react";
import { Button } from "./Button";

export interface GateCardProps {
  /** What's needed, as an outcome: "Verify your identity", "Fund your wallet". */
  title: string;
  /** One line on why / what happens next. Keep it a sentence. */
  description?: ReactNode;
  /** Inline resolution — never "go elsewhere" without the action attached. */
  actionLabel?: string;
  /** Link-style resolution (renders Button href). */
  actionHref?: string;
  /** Handler-style resolution (renders Button onClick). */
  onAction?: () => void;
  /** Action in flight. */
  loading?: boolean;
  /** Satisfied → compact confirmation row instead of a prompt card. */
  met?: boolean;
  className?: string;
}

/**
 * The one shared gate prompt (UX overhaul §5.2): every "you need X before Y"
 * block — connect, verify, fund — renders through this so the resolution is
 * always inline and always looks the same. Unmet: dashed card with a single
 * action. Met: a calm one-line confirmation.
 */
export function GateCard({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  loading = false,
  met = false,
  className,
}: GateCardProps) {
  if (met) {
    return (
      <div
        className={`flex items-center gap-2 rounded-md border border-border bg-surface-muted px-4 py-2 ${className ?? ""}`}
      >
        <span aria-hidden="true" className="text-success">
          ✓
        </span>
        <p className="text-caption text-text-2">{title}</p>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border border-dashed border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <div className="min-w-0">
        <p className="text-heading text-text-1">{title}</p>
        {description ? (
          <p className="text-caption mt-0.5 text-text-2">{description}</p>
        ) : null}
      </div>
      {actionLabel ? (
        actionHref !== undefined ? (
          <Button href={actionHref} size="sm" className="shrink-0">
            {actionLabel}
          </Button>
        ) : (
          <Button size="sm" onClick={onAction} loading={loading} className="shrink-0">
            {actionLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}
