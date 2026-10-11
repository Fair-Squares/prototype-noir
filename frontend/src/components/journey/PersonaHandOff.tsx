"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * S9 (UX_SIMPLIFICATION_PLAN.md): the first-run hand-off. One question —
 * "what brings you here?" — landing each persona on their first step, so a
 * newcomer knows where they fit within 30 seconds. Renders only while the
 * account has no position and no role signal, and can be dismissed for good
 * (per browser; localStorage).
 */
const DISMISS_KEY = "fs.personaHandOff.dismissed";

const CHOICES = [
  {
    title: "Invest in homes",
    body: "Help finance affordable homes and share the rental income.",
    href: "/portfolio#deposit",
    cta: "Start with a deposit",
  },
  {
    title: "I have a property",
    body: "Submit a property and its valuation for council review.",
    href: "/fund/submit",
    cta: "Submit a property",
  },
  {
    title: "I review homes",
    body: "Council members review proposed homes before a member vote.",
    href: "/governance",
    cta: "Open the review queue",
  },
] as const;

export interface PersonaHandOffProps {
  /** True when the account already shows a position or role — hides the card. */
  hasSignal: boolean;
}

export function PersonaHandOff({ hasSignal }: PersonaHandOffProps) {
  const [dismissed, setDismissed] = useState(true); // SSR-safe default: hidden

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (hasSignal || dismissed) return null;

  return (
    <section
      aria-label="Choose how to take part"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-heading text-text-1">Choose how to take part</h2>
          <p className="text-caption mt-1 text-text-2">
            Invest, submit a home or review proposals.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHOICES.map((choice) => (
          <div key={choice.title} className="flex flex-col rounded-md border border-border p-4">
            <p className="text-body font-semibold text-text-1">{choice.title}</p>
            <p className="text-caption mt-1 flex-1 text-text-2">{choice.body}</p>
            <Link href={choice.href} className="btn btn-secondary btn-sm mt-3 w-fit">
              {choice.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
