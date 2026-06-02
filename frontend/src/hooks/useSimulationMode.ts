"use client";

import { useEffect, useState } from "react";

const MODE_CACHE_KEY = "fs_runtime_mode";

export type RuntimeMode = "simulation" | "live" | "unknown";

export function useSimulationMode(): RuntimeMode {
  const envSimulation = process.env.NEXT_PUBLIC_SIMULATION === "true";
  const [mode, setMode] = useState<RuntimeMode>(envSimulation ? "simulation" : "unknown");

  useEffect(() => {
    if (envSimulation || typeof window === "undefined") return;

    const cached = sessionStorage.getItem(MODE_CACHE_KEY);
    if (cached === "simulation") {
      setMode("simulation");
      return;
    }
    if (cached === "live") {
      setMode("live");
      return;
    }

    fetch("/api/fund/stats", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { source?: string } | null;
        if (!data || typeof data.source !== "string") return;
        const resolved: RuntimeMode = data.source === "simulation" ? "simulation" : "live";
        sessionStorage.setItem(MODE_CACHE_KEY, resolved);
        setMode(resolved);
      })
      .catch(() => undefined);
  }, [envSimulation]);

  return mode;
}
