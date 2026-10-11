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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const summary = summarise(items.map((i) => i.state));

  // Close on outside click + Escape while open.
  useEffect(() => {
    if (!trustOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTrustOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTrustOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [trustOpen, setTrustOpen]);

  return (
    <div className="relative" ref={ref} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTrustOpen(false);
    }}>
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={trustOpen}
        aria-controls="trust-details"
        aria-label={`Trust and privacy: ${summary.word}. Open details.`}
        onClick={() => setTrustOpen(!trustOpen)}
        className={`chip before:hidden min-h-11 ${TONE[summary.state]} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
        style={{ touchAction: "manipulation" }}
      >
        {/* No emoji (brand rule) — a plain tone-coloured dot marks the state. */}
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 flex-none rounded-full bg-current"
        />
        <span className="hidden sm:inline">{summary.word}</span>
        <span aria-hidden="true" className="opacity-60">
          ▾
        </span>
      </button>

      {trustOpen ? (
        <div
          id="trust-details"
          role="region"
          aria-label="Trust and privacy"
          className="surface fixed inset-x-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-9rem)] overflow-y-auto p-4 shadow-sm sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 sm:max-w-[calc(100vw-2rem)]"
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
            href="/learn#privacy"
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
