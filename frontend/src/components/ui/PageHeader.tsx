import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Page title (rendered as the h1 / .text-display). */
  title: string;
  /** Optional uppercase eyebrow rendered above the title (.text-label). */
  eyebrow?: string;
  /** Optional supporting description below the title. */
  description?: ReactNode;
  /** Optional right-aligned action cluster (e.g. Buttons). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Page-level title block. Pure presentational: a left column with an optional
 * eyebrow, the page title, and an optional description; an optional right-side
 * actions cluster. Use once at the top of a route, above the Sections.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className ?? ""}`}
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <p className="text-label mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-display text-text-1">{title}</h1>
        {description ? (
          <p className="text-body mt-2 text-text-2">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
