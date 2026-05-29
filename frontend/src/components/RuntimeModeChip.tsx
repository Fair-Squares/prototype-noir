"use client";

import { useSimulationMode } from "@/hooks/useSimulationMode";

interface RuntimeModeChipProps {
  className?: string;
}

/**
 * Quiet runtime indicator that replaces the prominent "PROTOTYPE" stamp.
 *
 * - Simulation mode: a low-key dashed `.chip-sim` labelled "Simulation".
 * - Live mode: a calm neutral chip "Live · local network" with a small dot.
 *
 * Status never relies on colour alone — both states carry a text label.
 */
export default function RuntimeModeChip({ className = "" }: RuntimeModeChipProps) {
  const isSimulation = useSimulationMode();

  if (isSimulation) {
    return (
      <span className={`chip chip-sim ${className}`.trim()} aria-label="Runtime mode: simulation">
        Simulation
      </span>
    );
  }

  return (
    <span className={`chip chip-neutral ${className}`.trim()} aria-label="Runtime mode: live, local network">
      Live · local network
    </span>
  );
}
