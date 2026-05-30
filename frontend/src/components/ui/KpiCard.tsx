import type { ReactNode } from "react";
import { InfoDot } from "./Tooltip";

export type KpiTone = "default" | "accent" | "success" | "warning" | "danger";

export interface KpiCardProps {
  /** Uppercase metric label (.text-label). */
  label: string;
  /** Primary value (.text-kpi, tabular figures). */
  value: ReactNode;
  /** Optional sub / delta line under the value. */
  sub?: ReactNode;
  /** Tone accent applied to the value (status color). */
  tone?: KpiTone;
  /** Optional InfoTooltip text shown next to the label. */
  hint?: string;
  className?: string;
}

const VALUE_TONE: Record<KpiTone, string> = {
  default: "text-text-1",
  accent: "text-fs-teal-dark",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
};

/**
 * A single KPI tile: label (with optional tooltip), large tabular value, and an
 * optional sub/delta line. Tone tints the value with a status color. Pure
 * presentational — drop into a KpiGrid.
 */
export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  hint,
  className,
}: KpiCardProps) {
  return (
    <div className={`surface-muted p-4 ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-label">{label}</span>
        {hint ? <InfoDot label={label} content={hint} /> : null}
      </div>
      <p className={`text-kpi ${VALUE_TONE[tone]}`}>{value}</p>
      {sub ? <p className="text-caption mt-1.5 text-text-2">{sub}</p> : null}
    </div>
  );
}
