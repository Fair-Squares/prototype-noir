"use client";

import { useEffect, useState } from "react";

const MODE_CACHE_KEY = "fs_runtime_mode";

export function useSimulationMode(): boolean {
  const envSimulation = process.env.NEXT_PUBLIC_SIMULATION === "true";
  const [isSimulation, setIsSimulation] = useState(envSimulation);

  useEffect(() => {
    if (envSimulation || typeof window === "undefined") return;

    const cached = sessionStorage.getItem(MODE_CACHE_KEY);
    if (cached === "simulation") {
      setIsSimulation(true);
      return;
    }
    if (cached === "live") {
      setIsSimulation(false);
      return;
    }

    fetch("/api/fund/stats", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { source?: string } | null) => {
        const sim = data?.source === "simulation";
        sessionStorage.setItem(MODE_CACHE_KEY, sim ? "simulation" : "live");
        setIsSimulation(sim);
      })
      .catch(() => undefined);
  }, [envSimulation]);

  return isSimulation;
}
