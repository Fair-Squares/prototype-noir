"use client";

import { useId, useState, type ReactNode } from "react";

export interface TooltipProps {
  /** Tooltip body — kept short. */
  content: ReactNode;
  /** The trigger element. Should be (or contain) a focusable control. */
  children: ReactNode;
  /** Horizontal anchoring of the bubble relative to the trigger. */
  align?: "left" | "right" | "center";
  className?: string;
}

/**
 * Dependency-free, accessible tooltip.
 *
 * - Reveals on hover, focus, and keyboard focus-visible (CSS + state).
 * - Dismisses on blur, pointer-leave, and Escape.
 * - The trigger is wired to the bubble via `aria-describedby`; the bubble is
 *   `role="tooltip"` with a stable id.
 * - Animates opacity/transform only and honours `prefers-reduced-motion`
 *   through the global transition rules (no `transition: all`).
 *
 * Use it for a single hint next to a label — never on primary navigation.
 */
export function Tooltip({ content, children, align = "center", className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const alignClass =
    align === "right"
      ? "right-0 origin-top-right"
      : align === "left"
        ? "left-0 origin-top-left"
        : "left-1/2 -translate-x-1/2 origin-top";

  return (
    <span
      className={`relative inline-flex items-center ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={`absolute top-full z-50 mt-2 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card px-3 py-2 text-caption text-text-2 shadow-sm transition-[opacity,transform] duration-150 ${alignClass} ${
          open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        }`}
      >
        {content}
      </span>
    </span>
  );
}

export interface InfoDotProps {
  /** Accessible name for the trigger button (what the hint is about). */
  label: string;
  /** Hint content. */
  content: ReactNode;
  align?: TooltipProps["align"];
}

/**
 * Convenience: a small circular "i" trigger wrapped in a Tooltip. The glyph is
 * decorative (`aria-hidden`); the accessible name comes from `label`.
 */
export function InfoDot({ label, content, align = "center" }: InfoDotProps) {
  return (
    <Tooltip content={content} align={align}>
      <button
        type="button"
        aria-label={label}
        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-muted text-num font-bold text-text-3 transition-colors before:absolute before:-inset-3 before:content-[''] hover:text-text-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <span aria-hidden="true">i</span>
      </button>
    </Tooltip>
  );
}
