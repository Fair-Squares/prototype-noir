import type { ReactNode } from "react";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps {
  tone?: AlertTone;
  /** Optional bold heading line. */
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

// Each tone pairs a background tint with a matching border + text color, drawn
// straight from the status tokens in globals.css. Info reuses the accent/teal
// family. Calm by design — no full-saturation fills.
const TONE: Record<AlertTone, { box: string; text: string }> = {
  info: {
    box: "border-[rgba(57,166,163,0.3)] bg-[rgba(57,166,163,0.1)]",
    text: "text-fs-teal-dark",
  },
  success: {
    box: "border-[rgba(46,140,137,0.25)] bg-[var(--color-success-bg)]",
    text: "text-[var(--color-success)]",
  },
  warning: {
    box: "border-[rgba(178,107,0,0.25)] bg-[var(--color-warning-bg)]",
    text: "text-[var(--color-warning)]",
  },
  danger: {
    box: "border-[rgba(192,53,59,0.25)] bg-[var(--color-danger-bg)]",
    text: "text-[var(--color-danger)]",
  },
};

/**
 * Calm inline alert / callout. Tone selects a muted status tint + border;
 * `title` renders in the tone color, body copy stays readable in text-2.
 * Uses role=status for info/success and role=alert for warning/danger so it
 * announces appropriately.
 */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const t = TONE[tone];
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";
  return (
    <div
      role={role}
      className={`rounded-md border px-4 py-3 ${t.box} ${className ?? ""}`}
    >
      {title ? (
        <p className={`text-caption font-semibold ${t.text}`}>{title}</p>
      ) : null}
      {children ? (
        <div className={`text-caption text-text-2 ${title ? "mt-1" : ""}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
