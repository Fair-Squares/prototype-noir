"use client";

import { ActionBar, Button, InfoDot, Section, StatusChip } from "@/components/ui";
import { formatEUR } from "@/lib/contracts";

export interface RentEarningsPanelProps {
  /** Lifetime pro-rata rent earned. */
  earned: number;
  /** Unclaimed rent = earned − withdrawn − reinvested. */
  claimable: number;
  withdrawn: number;
  reinvested: number;
  claiming: boolean;
  reinvesting: boolean;
  /** Reinvest is wired in simulation; live needs the private reinvest path. */
  reinvestAvailable: boolean;
  onWithdraw: () => void;
  onReinvest: () => void;
}

/**
 * Rent earnings — the holder's monthly income, kept deliberately separate from
 * share value (NAV). Rent is pooled across every home the fund owns and shared
 * pro-rata (with the small-saver floor); the holder either withdraws it as cash
 * or reinvests it back into the fund to compound. Two plain numbers, two actions
 * — per the canonical model in CLAUDE.md. Every figure is real on-chain rent.
 */
export function RentEarningsPanel({
  earned,
  claimable,
  withdrawn,
  reinvested,
  claiming,
  reinvesting,
  reinvestAvailable,
  onWithdraw,
  onReinvest,
}: RentEarningsPanelProps) {
  const hasClaimable = claimable > 0;
  const busy = claiming || reinvesting;

  return (
    <Section
      title="Rent earnings"
      description="Your pooled, pro-rata share of rent collected across all the fund's homes — monthly income on top of your share value, not part of NAV."
      actions={
        hasClaimable ? (
          <StatusChip status="ready" label="Available to claim" />
        ) : (
          <StatusChip status="pending" label="Nothing to claim yet" />
        )
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="text-label">Claimable now</span>
        <InfoDot
          label="What are rent earnings"
          content="Rent is pooled across every home the fund owns and shared pro-rata to your Fund Shares (with the small-saver floor on top). It is a separate earnings stream — withdraw it as cash, or reinvest it into the fund to compound. It is income on top of your share value, never part of NAV."
        />
      </div>
      <p className="text-kpi mt-1 text-text-1">{formatEUR(claimable)}</p>

      <ActionBar align="start" className="mt-4">
        <Button onClick={onWithdraw} loading={claiming} disabled={!hasClaimable || busy}>
          {claiming ? "Withdrawing…" : "Withdraw as cash"}
        </Button>
        <Button
          variant="secondary"
          onClick={onReinvest}
          loading={reinvesting}
          disabled={!hasClaimable || busy || !reinvestAvailable}
        >
          {reinvesting ? "Reinvesting…" : "Reinvest in fund"}
        </Button>
      </ActionBar>

      {!reinvestAvailable ? (
        <p className="text-caption mt-3 text-text-3">
          Reinvest is available in simulation. In live mode, withdraw your rent then use Invest to
          redeposit it.
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-label">Earned to date</dt>
          <dd className="text-body text-mono text-text-1">{formatEUR(earned)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-label">Withdrawn</dt>
          <dd className="text-body text-mono text-text-1">{formatEUR(withdrawn)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-label">Reinvested</dt>
          <dd className="text-body text-mono text-text-1">{formatEUR(reinvested)}</dd>
        </div>
      </dl>
    </Section>
  );
}
