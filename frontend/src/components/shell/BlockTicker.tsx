"use client";

import { useEffect, useState } from "react";

const POLL_MS = 5_000;

interface BlockResponse {
  mode?: "live" | "simulation";
  blockNumber?: number | null;
}

type TickerState = {
  mode: "live" | "simulation" | null;
  block: number | null;
  /** False after a failed/stale read — render dims, value not faked. */
  ok: boolean;
};

/**
 * Footer "live block" readout. Polls /api/chain/block (a plain node RPC, not the
 * PXE) every few seconds and updates in place — no page refresh. Pauses while
 * the tab is hidden so a backgrounded tab generates zero requests, and resumes
 * (with an immediate read) on return. Shows "Simulation" when there is no live
 * chain, and "—" rather than a fabricated height when the node read fails.
 *
 * Note: the local network produces blocks on-demand (only when there are txs),
 * so the height advances with activity rather than on a wall clock; the pulse
 * dot signals that polling is live even while the number sits still.
 */
export function BlockTicker() {
  const [state, setState] = useState<TickerState>({ mode: null, block: null, ok: true });

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/chain/block", { cache: "no-store" });
        const data = (await res.json()) as BlockResponse;
        if (!active) return;
        setState({
          mode: data.mode ?? null,
          block: typeof data.blockNumber === "number" ? data.blockNumber : null,
          ok: res.ok,
        });
      } catch {
        if (active) setState((prev) => ({ ...prev, ok: false }));
      } finally {
        inFlight = false;
        if (active && !document.hidden) timer = setTimeout(run, POLL_MS);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      } else if (!timer && !inFlight) {
        run();
      }
    };

    run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const isSim = state.mode === "simulation";
  const live = state.mode === "live" && state.ok && state.block != null;
  const label = isSim
    ? "Simulation"
    : state.block != null
      ? `Block ${state.block.toLocaleString()}`
      : "Block —";
  const title = isSim
    ? "Simulation mode — no live chain"
    : "Current Aztec block height (advances with on-chain activity)";

  return (
    <span className="text-tag flex items-center gap-1.5" title={title}>
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          live ? "bg-fs-teal animate-pulse" : "bg-text-3"
        }`}
      />
      <span className="text-mono" aria-live="polite">
        {label}
      </span>
    </span>
  );
}
