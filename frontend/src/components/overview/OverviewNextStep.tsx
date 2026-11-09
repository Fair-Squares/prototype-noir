"use client";

import Link from "next/link";
import { Button, StatusChip } from "@/components/ui";
import { formatEUR, type KYCProfile, type PortfolioData } from "@/lib/contracts";

/**
 * "Your next step" — exactly one calm primary action, derived from real wallet,
 * KYC, and portfolio state. The journey is Connect → Verify → Invest → View
 * portfolio; the current focus is the first unmet step. No invented gating: a
 * step only advances on a real signal (a verified KYC profile, a deposit ticket
 * or FSFT exposure in the portfolio).
 */

export type NextStep = "connect" | "verify" | "invest" | "portfolio";

const COPY: Record<NextStep, { title: string; body: string; href: string; cta: string }> = {
  connect: {
    title: "Connect to begin",
    body: "Select an account to view your position and take part in the housing fund.",
    href: "/portfolio",
    cta: "Connect account",
  },
  verify: {
    title: "Verify your identity",
    body: "Verify your identity before depositing.",
    href: "/kyc",
    cta: "Verify identity",
  },
  invest: {
    title: "Make your first deposit",
    body: "Deposit to help finance affordable homes.",
    href: "/portfolio#deposit",
    cta: "Go to deposit",
  },
  portfolio: {
    title: "Review your position",
    body: "Check your shares and rental income.",
    href: "/portfolio",
    cta: "Open portfolio",
  },
};

/** Map real wallet + KYC + portfolio state to the single most relevant step. */
export function deriveNextStep(
  isConnected: boolean,
  kyc: KYCProfile | null,
  portfolio: PortfolioData | null
): NextStep {
  if (!isConnected) return "connect";
  if (!kyc || !kyc.verified) return "verify";
  const hasPosition =
    (portfolio != null && (portfolio.depositedAmount > 0 || portfolio.balance > 0)) ||
    Boolean(kyc.hasDepositTicket) ||
    Boolean(kyc.hasFsftExposure);
  return hasPosition ? "portfolio" : "invest";
}

export function OverviewNextStep({
  step,
  portfolio,
  connectAction,
}: {
  step: NextStep;
  /** Real position summary, shown only when the user already holds one. */
  portfolio: PortfolioData | null;
  /** When provided (step==="connect"), connect in place instead of navigating. */
  connectAction?: { onConnect: () => void; busy: boolean };
}) {
  const copy = COPY[step];
  const useConnectButton = step === "connect" && Boolean(connectAction);

  // Only quote a real, held value — never a placeholder. The position is the
  // money put in: Fund Shares are issued out of it at purchase price, so adding
  // a share value on top would count the same euros twice.
  const positionEur =
    step === "portfolio" && portfolio != null && portfolio.depositedAmount > 0
      ? portfolio.depositedAmount
      : null;

  return (
    <section className="surface p-5" aria-labelledby="next-step-heading">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h2 id="next-step-heading" className="text-heading text-text-1">
          Your next step
        </h2>
        <StatusChip
          status={step === "portfolio" ? "active" : "pending"}
          label={step === "portfolio" ? "Invested" : "Action needed"}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-body font-semibold text-text-1">{copy.title}</p>
          <p className="text-caption mt-1 max-w-md text-text-2">{copy.body}</p>
          {positionEur != null ? (
            <p className="text-caption mt-2 text-text-2">
              You have{" "}
              <span className="text-mono tabular-nums text-text-1">
                {formatEUR(positionEur)}
              </span>{" "}
              in the fund.
            </p>
          ) : null}
        </div>
        {useConnectButton && connectAction ? (
          <Button
            className="flex-shrink-0"
            onClick={connectAction.onConnect}
            loading={connectAction.busy}
          >
            {connectAction.busy ? "Connecting…" : copy.cta}
          </Button>
        ) : (
          <Link href={copy.href} className="btn btn-primary flex-shrink-0">
            {copy.cta}
          </Link>
        )}
      </div>
    </section>
  );
}
