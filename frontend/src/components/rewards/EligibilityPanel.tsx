import { ProofChip, StatusChip } from "@/components/ui";
import type { RewardsStats } from "@/lib/contracts";

export interface EligibilityPanelProps {
  eligibility: RewardsStats["eligibility"];
  weighting: RewardsStats["weighting"];
}

/**
 * Participation-eligibility readout for rewards. Surfaces the three reward
 * buckets (deposit / FSFT / governance) as proof chips, an overall "can claim
 * now" status, and any plain-language next steps the API returns. Honest about
 * missing data: only renders what the eligibility object actually carries.
 */
export function EligibilityPanel({ eligibility, weighting }: EligibilityPanelProps) {
  const buckets: Array<{ label: string; weight: number; state: "ok" | "off" }> = [
    {
      label: "Held a deposit position",
      weight: weighting.deposit,
      state: eligibility.depositBucketEligible ? "ok" : "off",
    },
    {
      label: "Held property tokens",
      weight: weighting.fsft,
      state: eligibility.fsftBucketEligible ? "ok" : "off",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ProofChip
          label="Verified investor"
          state={eligibility.investorRole ? "ok" : "off"}
        />
        <StatusChip
          status={eligibility.canClaimNow ? "ready" : "pending"}
          label={eligibility.canClaimNow ? "Ready to claim" : "Nothing to claim yet"}
        />
      </div>

      <div>
        <p className="text-label mb-2">Participation buckets</p>
        <ul className="space-y-2">
          {buckets.map((bucket) => (
            <li
              key={bucket.label}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-body text-text-1">{bucket.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-meta tabular-nums text-text-2">
                  {bucket.weight}% weight
                </span>
                <ProofChip
                  label={bucket.state === "ok" ? "Counted" : "Not counted"}
                  state={bucket.state}
                />
              </span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body text-text-1">Governance participation</span>
            <span className="flex items-center gap-2">
              <span className="text-meta tabular-nums text-text-2">
                {weighting.governance}% weight
              </span>
              {eligibility.governanceBucketHint ? (
                <span className="text-meta text-text-3">
                  {eligibility.governanceBucketHint}
                </span>
              ) : null}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
