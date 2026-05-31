"use client";

import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export interface ModelledChipProps {
  /** Visible label. Default "Modelled for demo". */
  label?: string;
  /**
   * Optional explanation shown in an accessible tooltip on hover/focus.
   * Pass `null` to render the bare chip with no tooltip.
   */
  hint?: ReactNode;
  /** Tooltip alignment when `hint` is set. */
  hintAlign?: "left" | "right" | "center";
  className?: string;
}

const DEFAULT_HINT =
  "Modelled for the demo — not an on-chain value. Anything real (deposits, votes, claims, NAV) is shown without this tag.";

/**
 * "Modelled for demo" badge — the honesty marker that separates real on-chain
 * figures from demo-only numbers (rent income, capital stack, reserve surplus,
 * affordability covenant). Built on the low-key dashed `.chip-sim` style so it
 * is always legible but never dominant. This labelling *is* part of the pitch
 * to housing partners: we never present a modelled number as live.
 *
 * Mirrors `RuntimeModeChip`: a chip, optionally wrapped in an accessible
 * Tooltip. Safe to render inside server components.
 */
export function ModelledChip({
  label = "Modelled for demo",
  hint = DEFAULT_HINT,
  hintAlign = "center",
  className = "",
}: ModelledChipProps) {
  const chip = (
    <span
      className={`chip chip-sim ${className}`.trim()}
      aria-label={`${label}: a modelled value, not read from the chain`}
    >
      {label}
    </span>
  );

  if (!hint) return chip;

  return (
    <Tooltip content={hint} align={hintAlign}>
      {chip}
    </Tooltip>
  );
}
