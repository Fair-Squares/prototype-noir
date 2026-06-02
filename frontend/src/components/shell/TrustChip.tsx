"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ProofChip, type ProofState } from "@/components/ui";
import { useProofSignals } from "@/contexts/ProofSignalsContext";
import { useShell } from "./ShellProvider";

/** Worst-of reducer: blocked > pending > ok > off. Drives the summary tone. */
function summarise(states: ProofState[]): { state: ProofState; word: string } {
  if (states.includes("blocked")) return { state: "blocked", word: "Action needed" };
  if (states.includes("pending")) return { state: "pending", word: "Checking" };
  if (states.includes("ok")) return { state: "ok", word: "Private · verified" };
  return { state: "off", word: "Not connected" };
}

const TONE: Record<ProofState, string> = {
  ok: "chip-accent",
  pending: "chip-warning",
  blocked: "chip-danger",
  off: "chip-neutral",
};

/**
 * Compact trust status. Replaces the standing 260px proof rail and the mobile
 * collapsible strip with one summary chip that opens a popover (desktop) /
 * bottom sheet (mobile) holding the full ProofChip list. Privacy stays a
 * visible assurance without being part of the surrounding chrome.
 */
export default function TrustChip() {
  const { items, freshAs } = useProofSignals();
  const { trustOpen, setTrustOpen } = useShell();
  const ref = useRef<HTMLDivElement>(null);

  const summary = summarise(items.map((i) => i.state));

  // Close on outside click + Escape while open.
  useEffect(() => {
    if (!trustOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTrustOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrustOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [trustOpen, setTrustOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={trustOpen}
        aria-haspopup="dialog"
        aria-label={`Trust and privacy: ${summary.word}. Open details.`}
        onClick={() => setTrustOpen(!trustOpen)}
        className={`chip min-h-11 ${TONE[summary.state]} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
        style={{ touchAction: "manipulation" }}
      >
        <span aria-hidden="true">🛡</span>
        <span className="hidden sm:inline">{summary.word}</span>
        <span aria-hidden="true" className="opacity-60">
          ▾
        </span>
      </button>

      {trustOpen ? (
        <div
          role="dialog"
          aria-label="Trust and privacy"
          className="surface absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] p-4 shadow-sm"
          style={{ overscrollBehavior: "contain" }}
        >
          <p className="text-label mb-3">Trust &amp; privacy</p>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.label} className="flex flex-col gap-1">
                <ProofChip label={item.label} state={item.state} />
                {item.hint ? <p className="text-caption text-text-3">{item.hint}</p> : null}
              </li>
            ))}
          </ul>
          {freshAs ? (
            <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">{freshAs}</p>
          ) : null}
          <Link
            href="/explain"
            onClick={() => setTrustOpen(false)}
            className="text-caption mt-3 inline-flex font-semibold text-fs-teal-dark hover:text-fs-magenta"
          >
            What does “private” mean? →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
