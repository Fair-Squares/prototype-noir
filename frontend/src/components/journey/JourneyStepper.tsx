"use client";

import Link from "next/link";
import { useMemo } from "react";
import { InfoDot, Stepper, StatusChip, type Step } from "@/components/ui";
import type { KYCProfile, Listing, PortfolioData, Proposal } from "@/lib/contracts";

/** Per-step "what happens on-chain?" copy — same voice as the /explain page
 *  (privacy-first phrasing; no crypto hype). */
const ON_CHAIN: Record<string, string> = {
  verify:
    "A verifier confirms you privately: eligibility is provable on-chain without your identity documents ever touching the chain.",
  deposit:
    "Your euros join the pooled housing fund. How much you deposited stays visible to you, not to other members — only the aggregate is public.",
  properties:
    "Owners submit homes with an appraisal dossier (hashed on-chain); the housing council scores price-quality before any home can reach a vote.",
  vote:
    "A secret ballot: you prove you are a verified member with fund exposure and vote once — without revealing which way you voted.",
  track:
    "Funded homes pay covenant-capped rent (at least 20% below market). Your share of distributions and rent is claimable from your portfolio.",
};

export interface JourneyStepperProps {
  kyc: KYCProfile | null;
  portfolio: PortfolioData | null;
  listings: Listing[];
  proposals: Proposal[];
}

interface JourneyStep {
  key: keyof typeof ON_CHAIN;
  label: string;
  done: boolean;
  /** One primary action that advances this step. */
  action: { href: string; label: string };
  detail: string;
}

/**
 * J5: the journey home — Verify → Deposit → Properties → Vote → Track, each
 * step derived from the connected account's real on-chain state, with exactly
 * one deep-link action. Role-aware: property owners get the submit variant of
 * the properties step; council members get a review call-out.
 */
export function JourneyStepper({ kyc, portfolio, listings, proposals }: JourneyStepperProps) {
  const isOwner = Boolean(kyc?.isPropertyOwner);
  const isCouncil = Boolean(kyc?.isCouncil);

  const steps: JourneyStep[] = useMemo(() => {
    const verified = Boolean(kyc?.isInvestor);
    const deposited = (portfolio?.depositedAmount ?? 0) > 0;
    const pipelineExists = listings.length > 0;
    const openVotes = proposals.filter((p) => p.status === 0).length;
    const anyDecided = proposals.some((p) => p.status !== 0);
    const holdsShares = (portfolio?.balance ?? 0) > 0;
    const hasClaimables =
      (portfolio?.rentClaimable ?? 0) > 0 || (portfolio?.rewardsClaimable ?? 0) > 0;

    return [
      {
        key: "verify",
        label: "Verify",
        done: verified,
        action: { href: "/kyc", label: verified ? "View verification" : "Get verified" },
        detail: verified
          ? "You hold the investor role."
          : "One-time eligibility check — everything else unlocks after this.",
      },
      {
        key: "deposit",
        label: "Deposit",
        done: deposited,
        action: { href: "/portfolio#deposit", label: deposited ? "Deposit more" : "Make your first deposit" },
        detail: deposited
          ? "Your capital is pooled and working."
          : "From €50 — your deposit finances homes and earns the capped return.",
      },
      {
        key: "properties",
        label: "Properties",
        done: pipelineExists,
        action: isOwner
          ? { href: "/fund/submit", label: "Submit a property" }
          : { href: "/fund", label: "Browse the pipeline" },
        detail: isOwner
          ? "You hold the property-owner role — submit a home with its appraisal dossier."
          : pipelineExists
            ? `${listings.length} home${listings.length === 1 ? "" : "s"} in the onboarding pipeline.`
            : "Homes enter here: owner dossier, then council review.",
      },
      {
        key: "vote",
        label: "Vote",
        done: anyDecided && openVotes === 0,
        action: { href: "/governance", label: openVotes > 0 ? "Vote now" : "View decisions" },
        detail:
          openVotes > 0
            ? `${openVotes} funding request${openVotes === 1 ? "" : "s"} open for your secret ballot.`
            : anyDecided
              ? "No votes open right now — decisions to date are on the board."
              : "Funding requests appear here once a listing clears council review.",
      },
      {
        key: "track",
        label: "Track",
        done: holdsShares || hasClaimables,
        action: { href: "/portfolio", label: hasClaimables ? "Claim your share" : "View portfolio" },
        detail: hasClaimables
          ? "You have unclaimed rent or rewards waiting."
          : holdsShares
            ? "Your shares, rent and rewards in one place."
            : "Once a home you backed is funded, your share shows up here.",
      },
    ];
  }, [kyc, portfolio, listings, proposals, isOwner]);

  // The active step is the first not-done one; all-done parks on Track.
  const current = useMemo(() => {
    const idx = steps.findIndex((s) => !s.done);
    return idx === -1 ? steps.length - 1 : idx;
  }, [steps]);

  const councilPending = useMemo(
    () => listings.filter((l) => l.status === 1).length,
    [listings]
  );

  const stepperSteps: Step[] = steps.map((s, i) => ({
    label: s.label,
    description: (
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-1">
          <span className="text-caption text-text-2">{s.detail}</span>
          <InfoDot label={`What happens on-chain in the ${s.label} step`} content={ON_CHAIN[s.key]} />
        </span>
        {i === current || (i === steps.length - 1 && current === steps.length - 1) ? (
          <Link href={s.action.href} className="text-body-sm font-semibold text-fs-teal-dark hover:underline">
            {s.action.label} →
          </Link>
        ) : null}
      </span>
    ),
  }));

  return (
    <section aria-label="Your journey" className="flex flex-col gap-4">
      <Stepper steps={stepperSteps} current={current} />
      {isCouncil && councilPending > 0 ? (
        <div className="flex items-center gap-2">
          <StatusChip status="pending" label={`Council: ${councilPending} awaiting review`} />
          <Link href="/governance" className="text-body-sm font-semibold text-fs-teal-dark hover:underline">
            Open the review queue →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
