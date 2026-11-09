"use client";

import { ProofChip, type ProofState } from "@/components/ui";
import type { FundStats, KYCProfile } from "@/lib/contracts";

/**
 * Compact "what is verified / how fresh is this" line for the Overview.
 *
 * Privacy and data provenance are shown as plain assurance chips, not crypto
 * jargon. Every chip is backed by a real signal: the fund-stats data source
 * (live chain vs in-memory simulation), and — once a wallet is connected — the
 * KYC profile flags (verified, investor role, voting/reward readiness). When no
 * wallet is connected we only show the public data-source chip; we never invent
 * a personal verification state.
 */

function sourceState(source?: string): ProofState {
  if (source === "live") return "ok";
  // simulation / unknown: data is real but not from a live chain.
  return "pending";
}

function boolState(value: boolean | undefined): ProofState {
  if (value === true) return "ok";
  if (value === false) return "pending";
  return "off";
}

export function DataHealthRail({
  stats,
  kyc,
  isConnected,
}: {
  stats: FundStats | null;
  kyc: KYCProfile | null;
  isConnected: boolean;
}) {
  const dataLabel =
    stats == null
      ? "Data: loading"
      : stats.source === "live"
        ? "Live chain data"
        : "Simulation data";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-label">Trust &amp; data</span>
      <ProofChip label={dataLabel} state={stats ? sourceState(stats.source) : "off"} />

      {isConnected ? (
        <>
          <ProofChip label="Wallet connected" state="ok" />
          <ProofChip label="Identity verified" state={boolState(kyc?.verified)} />
          <ProofChip label="Investor role" state={boolState(kyc?.isInvestor)} />
          <ProofChip label="Voting eligible" state={boolState(kyc?.canVote)} />
          <ProofChip label="Rewards eligible" state={boolState(kyc?.rewardsEligible)} />
        </>
      ) : (
        <ProofChip label="Wallet not connected" state="off" />
      )}
    </div>
  );
}
