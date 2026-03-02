"use client";

import { useSimulationMode } from "@/hooks/useSimulationMode";

interface SimulationModeBadgeProps {
  className?: string;
}

export default function SimulationModeBadge({ className = "" }: SimulationModeBadgeProps) {
  const isSimulation = useSimulationMode();
  if (!isSimulation) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 ${className}`.trim()}
    >
      Simulation
    </span>
  );
}
