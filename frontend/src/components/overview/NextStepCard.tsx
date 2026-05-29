"use client";

import Link from "next/link";
import { Stepper, StatusChip, type Step } from "@/components/ui";

const STEP_ORDER: NextStep[] = ["connect", "verify", "invest", "portfolio"];

const STEPS: Step[] = [
  { label: "Connect", description: "Select an account" },
  { label: "Verify", description: "Identity + investor status" },
  { label: "Invest", description: "Deposit EUR" },
  { label: "Portfolio", description: "Track your position" },
];

/**
 * "Your next step" — a calm, single primary action derived from real wallet +
 * KYC state. The flow is Connect → Verify → Invest → View portfolio. Exactly
 * one step is the current focus; earlier steps read as done, later steps wait.
 */

export type NextStep = "connect" | "verify" | "invest" | "portfolio";

const COPY: Record<
  NextStep,
  { title: string; body: string; href: string; cta: string }
> = {
  connect: {
    title: "Connect to begin",
    body: "Select an account to view your position and take part in the fund.",
    href: "/portfolio",
    cta: "Connect account",
  },
  verify: {
    title: "Verify your identity",
    body: "Complete identity and investor verification before you can deposit capital.",
    href: "/kyc",
    cta: "Go to verification",
  },
  invest: {
    title: "Make your first deposit",
    body: "You are verified. Deposit EUR to take a position in the housing fund.",
    href: "/invest",
    cta: "Go to deposit",
  },
  portfolio: {
    title: "Review your position",
    body: "You hold a position in the fund. Track your balance, share, and rewards.",
    href: "/portfolio",
    cta: "Open portfolio",
  },
};

export function NextStepCard({
  step,
  connectAction,
}: {
  step: NextStep;
  /** When provided (and step==="connect"), renders an in-place connect button
   *  instead of a navigation link. */
  connectAction?: { onConnect: () => void; busy: boolean };
}) {
  const copy = COPY[step];
  const useConnectButton = step === "connect" && connectAction;
  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <section className="surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text-1">Your next step</h2>
        <StatusChip
          status={step === "portfolio" ? "active" : "pending"}
          label={step === "portfolio" ? "Invested" : "Action needed"}
        />
      </div>

      <Stepper steps={STEPS} current={currentIndex} className="mb-5" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-body font-semibold text-text-1">{copy.title}</p>
          <p className="text-caption mt-1 max-w-md text-text-2">{copy.body}</p>
        </div>
        {useConnectButton ? (
          <button
            type="button"
            className="btn btn-primary flex-shrink-0"
            onClick={connectAction.onConnect}
            data-loading={connectAction.busy ? "true" : undefined}
            aria-busy={connectAction.busy || undefined}
            disabled={connectAction.busy}
          >
            {connectAction.busy ? "Connecting…" : copy.cta}
          </button>
        ) : (
          <Link href={copy.href} className="btn btn-primary flex-shrink-0">
            {copy.cta}
          </Link>
        )}
      </div>
    </section>
  );
}
