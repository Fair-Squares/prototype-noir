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

/**
 * Quiet runtime indicator that replaces the prominent "PROTOTYPE" stamp.
 *
 * - Simulation mode: a low-key dashed `.chip-sim` labelled "Simulation".
 * - Live mode: a calm neutral chip "Live · local network" with a small dot.
 *
 * Status never relies on colour alone — both states carry a text label. When
 * `withHint` is set, the chip is wrapped in an accessible Tooltip that explains
 * what the current mode means (opt-in help, used in the app shell).
 */
export default function RuntimeModeChip({
  className = "",
  withHint = false,
  hintAlign = "right",
}: RuntimeModeChipProps) {
  const isSimulation = useSimulationMode();

  const chip = isSimulation ? (
    <span className={`chip chip-sim ${className}`.trim()} aria-label="Runtime mode: simulation">
      Simulation
    </span>
  ) : (
    <span
      className={`chip chip-neutral ${className}`.trim()}
      aria-label="Runtime mode: live, local network"
    >
      Live · local network
    </span>
  );

  if (!withHint) return chip;

  const hint = isSimulation
    ? "Simulation: no real funds move. Figures are read from a local network so you can explore the flow safely."
    : "Live: connected to a local Aztec network. On-chain reads and writes use real test accounts.";

  return (
    <Tooltip content={hint} align={hintAlign}>
      {chip}
    </Tooltip>
  );
}
