"use client";

import { ActionBar, Button, InfoDot, Section, StatusChip } from "@/components/ui";

export interface RewardsPanelProps {
  rewardsSymbol: string;
  rewardsClaimable: number;
  canClaim: boolean;
  /** First guidance line from rewards eligibility, when not yet claimable. */
  nextStep?: string;
  claiming: boolean;
  attesting: boolean;
  onClaim: () => void;
  onRunCheck: () => void;
}

/**
 * Protocol rewards panel. Frames rewards as a program allocation that opens by
 * epoch — never as speculative yield. The claimable figure and eligibility are
 * passed in from the real rewards stats; the claim / private fund-shares check
 * wiring stays on the page.
 */
export function RewardsPanel({
  rewardsSymbol,
  rewardsClaimable,
  canClaim,
  nextStep,
  claiming,
  attesting,
  onClaim,
  onRunCheck,
}: RewardsPanelProps) {
  return (
    <Section
      title="Protocol rewards"
      description="A fixed program allocation that opens for claiming epoch by epoch."
      actions={
        canClaim ? (
          <StatusChip status="ready" label="Claim window open" />
        ) : (
          <StatusChip status="pending" label="Not claimable yet" />
        )
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="text-label">Claimable now ({rewardsSymbol})</span>
        <InfoDot
          label="How rewards work"
          content="Rewards are a fixed allocation distributed over the program's epochs based on your participation. They are not interest on your capital and are not a return forecast."
        />
      </div>
      <p className="text-kpi mt-1 text-text-1">{rewardsClaimable.toLocaleString()}</p>

      <ActionBar align="start" className="mt-4">
        <Button onClick={onClaim} loading={claiming} disabled={!canClaim || claiming}>
          {claiming ? "Claiming…" : "Claim rewards"}
        </Button>
        <Button variant="ghost" onClick={onRunCheck} loading={attesting}>
          {attesting ? "Checking…" : "Run private fund-shares check"}
        </Button>
      </ActionBar>

      {!canClaim ? (
        <p className="text-caption mt-3 text-text-3">
          {nextStep ?? "Rewards are not claimable yet for this account."}
        </p>
      ) : null}
    </Section>
  );
}
