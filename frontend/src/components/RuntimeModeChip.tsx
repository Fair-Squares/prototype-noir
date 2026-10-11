"use client";

import { useSimulationMode } from "@/hooks/useSimulationMode";
import { Tooltip } from "@/components/ui";

interface RuntimeModeChipProps {
  className?: string;
  /** Wrap the chip in an explanatory tooltip (shell use). Default false. */
  withHint?: boolean;
  /** Tooltip alignment when `withHint`. */
  hintAlign?: "left" | "right" | "center";
}

/** One honest demo indicator, shared by every page. */
export default function RuntimeModeChip({
  className = "",
  withHint = false,
  hintAlign = "right",
}: RuntimeModeChipProps) {
  const mode = useSimulationMode();
  const isSimulation = mode === "simulation";

  const chip =
    mode === "unknown" ? (
      <span className={`chip chip-neutral ${className}`.trim()} aria-label="Runtime mode: checking">
        Checking demo status…
      </span>
    ) : isSimulation ? (
      <span className={`chip chip-sim ${className}`.trim()} aria-label="Runtime mode: simulation">
        Demo · no real funds
      </span>
    ) : (
      <span
        className={`chip chip-neutral ${className}`.trim()}
        aria-label="Runtime mode: demo network, no real funds"
      >
        Demo network · no real funds
      </span>
    );

  if (!withHint) return chip;

  const hint =
    mode === "unknown"
      ? "Checking whether this demo uses sample data or a test network."
      : isSimulation
        ? "This demo uses sample balances and activity. No real money moves."
        : "Demo network: connected to an Aztec test network with test accounts — no real funds move.";

  return (
    <Tooltip content={hint} align={hintAlign}>
      {chip}
    </Tooltip>
  );
}
