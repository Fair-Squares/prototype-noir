/**
 * Guided demo (/demo) — the one-persona walkthrough's state machine.
 *
 * The stage is DERIVED from the simulation snapshot (never stored client-side),
 * so a refresh, a second tab or a trip through the regular app all land the
 * visitor back on the right step.
 */
import type { SimDemoSnapshot } from "./simulationStore";

export type DemoSnapshot = SimDemoSnapshot;

/** The persona the tour plays: the seeded, not-yet-verified test4 account. */
export const DEMO_ACCOUNT_INDEX = 4;
/** The featured home the tour votes on: the Maashaven proposal. */
export const DEMO_PROPOSAL_ID = 0;
/** Display name for the persona (the runbook's small saver). */
export const DEMO_PERSONA_NAME = "Sofie";

export type DemoStage =
  | "verify"
  | "invest"
  | "vote"
  | "vote_expired"
  | "fund_home"
  | "rejected"
  | "claim_shares"
  | "collect_rent"
  | "use_rent"
  | "done";

/** The five chapters shown in the progress rail. */
export const DEMO_STEPS = [
  { label: "Verify", description: "Prove who you are, privately" },
  { label: "Invest", description: "Put money into the fund" },
  { label: "Vote", description: "Decide which home to buy" },
  { label: "Own", description: "Receive your Fund Shares" },
  { label: "Earn", description: "Collect your share of rent" },
] as const;

const STEP_OF_STAGE: Record<DemoStage, number> = {
  verify: 0,
  invest: 1,
  vote: 2,
  vote_expired: 2,
  fund_home: 2,
  rejected: 2,
  claim_shares: 3,
  collect_rent: 4,
  use_rent: 4,
  done: DEMO_STEPS.length,
};

export function deriveDemoStage(s: DemoSnapshot): DemoStage {
  if (!s.verified) return "verify";
  if (s.deposited <= 0 && s.shares <= 0) return "invest";

  const { status, votingOpen } = s.proposal;
  if (status === 0) {
    if (s.hasVoted) return "fund_home";
    return votingOpen ? "vote" : "vote_expired";
  }
  if (status === 2) return "rejected";
  // Approved but not yet bought: the shortcut finishes the purchase.
  if (status === 1 || !s.proposal.distributionOpened) return "fund_home";

  if (!s.hasClaimedShares) return "claim_shares";
  if (s.rentClaimable > 0) return "use_rent";
  if (s.rentWithdrawn + s.rentReinvested > 0) return "done";
  return "collect_rent";
}

/** Zero-based index into DEMO_STEPS; DEMO_STEPS.length once finished. */
export function demoStepIndex(stage: DemoStage): number {
  return STEP_OF_STAGE[stage];
}

/** Investment presets: small enough to feel like a saver, all within the
 *  persona's starting balance. */
export const DEMO_INVEST_PRESETS = [500, 1_000, 5_000] as const;

/** The persona's pro-rata slice of one month of pooled rent. Mirrors the sim's
 *  rounding (simGetPortfolio) so the preview matches what lands. */
export function previewRentShare(
  monthlyRent: number,
  myShares: number,
  totalShares: number
): number {
  if (totalShares <= 0) return 0;
  return Math.round((monthlyRent * myShares) / totalShares);
}

// ── Client calls ──────────────────────────────────────────────────────────────

async function demoRequest(init?: RequestInit): Promise<DemoSnapshot> {
  const res = await fetch("/api/demo", { cache: "no-store", ...init });
  const body = (await res.json()) as { snapshot?: DemoSnapshot; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Demo request failed (${res.status})`);
  if (!body.snapshot) throw new Error("Malformed demo response: missing snapshot");
  return body.snapshot;
}

export function fetchDemoSnapshot(): Promise<DemoSnapshot> {
  return demoRequest();
}

export function runDemoAction(
  action: "reset" | "fund_home" | "collect_rent"
): Promise<DemoSnapshot> {
  return demoRequest({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}
