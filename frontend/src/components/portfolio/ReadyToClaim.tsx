"use client";

import { Button, EmptyState } from "@/components/ui";
import { formatEUR, formatFSFT, type Proposal } from "@/lib/contracts";

/**
 * S5 (UX_SIMPLIFICATION_PLAN.md): ONE "Ready to claim" list. Every euro or
 * token a member can collect — rent earnings, per-home payouts, participation
 * rewards — as rows with one claim pattern, instead of four claim verbs
 * spread across three surfaces.
 */
export interface ReadyToClaimProps {
  /** Rent stream. */
  rentClaimable: number;
  rentEarned: number;
  rentWithdrawn: number;
  rentReinvested: number;
  claimingRent: boolean;
  reinvestingRent: boolean;
  onClaimRent: () => void;
  onReinvestRent: () => void;
  /** Per-home payouts (open distributions the member can act on). */
  proposals: Proposal[];
  claimingProposalId: number | null;
  onClaimProposal: (proposalId: number) => void;
  /** Participation rewards. */
  rewardsSymbol: string;
  rewardsClaimable: number;
  canClaimRewards: boolean;
  rewardsNextStep?: string;
  claimingRewards: boolean;
  attesting: boolean;
  onClaimRewards: () => void;
  onRunRewardsCheck: () => void;
  disabled?: boolean;
}

function Row({
  title,
  caption,
  amount,
  actions,
}: {
  title: string;
  caption: string;
  amount: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-body font-semibold text-text-1">{title}</p>
        <p className="text-caption mt-0.5 text-text-2">{caption}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-mono text-body text-text-1">{amount}</span>
        {actions}
      </div>
    </div>
  );
}

export function ReadyToClaim(props: ReadyToClaimProps) {
  const {
    rentClaimable,
    rentEarned,
    rentWithdrawn,
    rentReinvested,
    claimingRent,
    reinvestingRent,
    onClaimRent,
    onReinvestRent,
    proposals,
    claimingProposalId,
    onClaimProposal,
    rewardsSymbol,
    rewardsClaimable,
    canClaimRewards,
    rewardsNextStep,
    claimingRewards,
    attesting,
    onClaimRewards,
    onRunRewardsCheck,
    disabled = false,
  } = props;

  const hasRent = rentEarned > 0 || rentClaimable > 0;
  const hasRewards = rewardsClaimable > 0 || Boolean(rewardsNextStep);
  const hasAny = hasRent || proposals.length > 0 || hasRewards;

  if (!hasAny) {
    return (
      <EmptyState
        title="Nothing to claim right now"
        description="Rent earnings, home payouts, and participation rewards appear here the moment they are claimable."
      />
    );
  }

  return (
    <div className="divide-y divide-border">
      {hasRent ? (
        <Row
          title="Rent earnings"
          caption={`${formatEUR(rentEarned)} earned lifetime · ${formatEUR(rentWithdrawn)} withdrawn · ${formatEUR(rentReinvested)} reinvested`}
          amount={formatEUR(rentClaimable)}
          actions={
            <>
              <Button
                size="sm"
                loading={claimingRent}
                disabled={disabled || rentClaimable <= 0 || reinvestingRent}
                onClick={onClaimRent}
              >
                {claimingRent ? "Claiming…" : "Claim"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={reinvestingRent}
                disabled={disabled || rentClaimable <= 0 || claimingRent}
                onClick={onReinvestRent}
              >
                {reinvestingRent ? "Reinvesting…" : "Reinvest"}
              </Button>
            </>
          }
        />
      ) : null}

      {proposals.map((p) => {
        const isPrivate =
          Boolean(p.hasPrivateDeposits) && Boolean(p.distributionOpened) && (p.claimableAmount ?? 0) === 0;
        const claimed = Boolean(p.hasClaimed);
        return (
          <Row
            key={p.id}
            title={`Home #${p.id} payout`}
            caption={
              claimed
                ? "You have claimed your share of this payout."
                : isPrivate
                  ? "Your deposits are private — your share is computed privately when you claim."
                  : "Your share of this home's payout, from the deposits at the time it opened."
            }
            amount={claimed ? "Claimed" : isPrivate ? "Private" : formatFSFT(p.claimableAmount ?? 0)}
            actions={
              claimed ? null : (
                <Button
                  size="sm"
                  loading={claimingProposalId === p.id}
                  disabled={disabled || claimingProposalId !== null}
                  onClick={() => onClaimProposal(p.id)}
                >
                  {claimingProposalId === p.id ? "Claiming…" : "Claim"}
                </Button>
              )
            }
          />
        );
      })}

      {hasRewards ? (
        <Row
          title="Participation rewards"
          caption={
            canClaimRewards
              ? "Earned by depositing, holding fund shares, and voting."
              : (rewardsNextStep ?? "Run the private check to unlock claiming.")
          }
          amount={`${rewardsClaimable.toLocaleString()} ${rewardsSymbol}`}
          actions={
            canClaimRewards ? (
              <Button
                size="sm"
                loading={claimingRewards}
                disabled={disabled}
                onClick={onClaimRewards}
              >
                {claimingRewards ? "Claiming…" : "Claim"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={attesting}
                disabled={disabled}
                onClick={onRunRewardsCheck}
              >
                {attesting ? "Checking…" : "Run private check"}
              </Button>
            )
          }
        />
      ) : null}
    </div>
  );
}
