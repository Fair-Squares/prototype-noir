"use client";

import { useSimulationMode } from "@/hooks/useSimulationMode";

export default function SimulationBanner() {
  const isSimulation = useSimulationMode();
  if (!isSimulation) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-center text-xs font-medium text-amber-800">
      Simulation mode: demo data in the UI only. No real blockchain transactions.
    </div>
  );
}
