import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Honest, specific headline (e.g. "No transaction history available"). */
  title: string;
  /** Optional supporting line explaining why it's empty / what to do. */
  description?: ReactNode;
  /** Optional action (e.g. a Button) rendered below the copy. */
  action?: ReactNode;
  /** Optional leading glyph / icon node. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Honest empty state. Centered, calm, no illustration cruft. Used inside
 * Sections, DataTables, and lists when there is genuinely nothing to show.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center ${className ?? ""}`}
    >
      {icon ? <div className="text-text-3">{icon}</div> : null}
      <p className="text-heading text-text-1">{title}</p>
      {description ? (
        <p className="text-caption max-w-sm text-text-2">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
