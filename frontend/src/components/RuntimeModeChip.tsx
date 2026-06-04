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
  const mode = useSimulationMode();
  const isSimulation = mode === "simulation";

  const chip =
    mode === "unknown" ? (
      <span className={`chip chip-neutral ${className}`.trim()} aria-label="Runtime mode: unknown">
        Mode unknown
      </span>
    ) : isSimulation ? (
      <span className={`chip chip-sim ${className}`.trim()} aria-label="Runtime mode: simulation">
        Simulation
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
      ? "Mode unknown: the runtime could not be determined yet. Reads will resolve once the network responds."
      : isSimulation
        ? "Simulation: no real funds move. Figures are read from a local network so you can explore the flow safely."
        : "Demo network: connected to an Aztec test network with test accounts — no real funds move.";

  return (
    <Tooltip content={hint} align={hintAlign}>
      {chip}
    </Tooltip>
  );
}
