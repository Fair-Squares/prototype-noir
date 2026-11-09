import type { ReactNode } from "react";

export interface SectionProps {
  /** Optional section heading (.text-heading). */
  title?: string;
  /** Optional supporting copy under the heading. */
  description?: ReactNode;
  /** Optional right-aligned action cluster in the header row. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding preset. 'normal' = p-5 (default), 'tight' = p-4, 'none' = no padding. */
  padding?: "normal" | "tight" | "none";
}

const PADDING: Record<NonNullable<SectionProps["padding"]>, string> = {
  normal: "p-4 sm:p-5",
  tight: "p-4",
  none: "",
};

/**
 * A .surface card section with an optional header row (title + description on
 * the left, actions on the right). The header is separated from the body by a
 * hairline rule only when a header is present.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  padding = "normal",
}: SectionProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section className={`surface ${PADDING[padding]} ${className ?? ""}`}>
      {hasHeader ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-heading text-text-1">{title}</h2> : null}
            {description ? (
              <p className="text-caption mt-1 text-text-2">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&_.btn]:w-full sm:[&_.btn]:w-auto">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
