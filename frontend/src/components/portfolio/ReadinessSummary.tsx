import { ProofChip, Section, type ProofState } from "@/components/ui";
import type { KYCProfile, PortfolioData } from "@/lib/contracts";

export interface ReadinessSummaryProps {
  kyc: KYCProfile;
  portfolio: PortfolioData;
}

function toState(ok: boolean): ProofState {
  return ok ? "ok" : "off";
}

/**
 * Readiness / proof summary. Each chip carries a text label and the proof
 * state is exposed to assistive tech via ProofChip's aria-label, so meaning
 * never relies on color alone. All values come straight from the KYC profile,
 * portfolio eligibility flags, and governance eligibility — nothing invented.
 */
export function ReadinessSummary({ kyc, portfolio }: ReadinessSummaryProps) {
  const gov = portfolio.governanceEligibility;
  const canVote = gov?.canVote ?? kyc.canVote ?? false;
  const canTradeDex = portfolio.canTradeDex ?? kyc.canTradeDex ?? false;
  const rewardsEligible = portfolio.rewardsEligible ?? kyc.rewardsEligible ?? false;

  return (
    <Section
      title="Readiness"
      description="What your account is verified and cleared to do."
    >
      <ul className="flex flex-col gap-3">
        <li className="flex flex-col gap-1">
          <ProofChip label="Identity verified" state={toState(kyc.verified)} />
          <p className="text-caption text-text-3">
            {kyc.verified
              ? "Your identity check has passed."
              : "Complete identity verification to unlock investor actions."}
          </p>
        </li>
        <li className="flex flex-col gap-1">
          <ProofChip label="Investor role" state={toState(kyc.isInvestor)} />
          <p className="text-caption text-text-3">
            {kyc.isInvestor
              ? "You hold an active investor credential."
              : "An investor credential is required to deposit and claim."}
          </p>
        </li>
        <li className="flex flex-col gap-1">
          <ProofChip label="Governance eligible" state={toState(canVote)} />
          {gov?.reason ? (
            <p className="text-caption text-text-3">{gov.reason}</p>
          ) : (
            <p className="text-caption text-text-3">
              {canVote
                ? "You can vote on housing proposals."
                : "Voting on proposals is not yet available for this account."}
            </p>
          )}
        </li>
        <li className="flex flex-col gap-1">
          <ProofChip label="Trading cleared" state={toState(canTradeDex)} />
          <p className="text-caption text-text-3">
            {canTradeDex
              ? "You can place orders on the share market."
              : "Trading shares on the market is not yet available for this account."}
          </p>
        </li>
        <li className="flex flex-col gap-1">
          <ProofChip label="Rewards eligible" state={toState(rewardsEligible)} />
          <p className="text-caption text-text-3">
            {rewardsEligible
              ? "Your account qualifies for protocol rewards."
              : "Protocol rewards are not yet available for this account."}
          </p>
        </li>
      </ul>
    </Section>
  );
}
