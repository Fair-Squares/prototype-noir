import type { ReactNode } from "react";

export interface ActionBarProps {
  children: ReactNode;
  /** Horizontal alignment of the actions. Default 'end'. */
  align?: "start" | "end" | "between";
  className?: string;
}

const ALIGN: Record<NonNullable<ActionBarProps["align"]>, string> = {
  start: "justify-start",
  end: "justify-end",
  between: "justify-between",
};

/**
 * A section/footer action row with consistent gap and wrapping. Place at the
 * bottom of a Section or form to group its Buttons.
 */
export function ActionBar({ children, align = "end", className }: ActionBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${ALIGN[align]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
