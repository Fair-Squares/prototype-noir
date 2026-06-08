"use client";

import { Alert, Button, EmptyState, KpiCard, KpiGrid, Section } from "@/components/ui";
import { formatEUR, formatFSFT, type Proposal } from "@/lib/contracts";

export interface DistributionTabProps {
  proposal: Proposal;
  isConnected: boolean;
  isClaiming: boolean;
  /** Wraps the real claimProposalDistribution call. */
  onClaim: () => void;
}

/**
 * Distribution & allocation tab. Explains, in plain words, how the proceeds
 * from an executed proposal are split, then surfaces the reader's claimable
 * share and the claim action. Only on-chain fields are shown.
 */
export function DistributionTab({
  proposal,
  isConnected,
  isClaiming,
  onClaim,
}: DistributionTabProps) {
  const opened = Boolean(proposal.distributionOpened);
  const total = proposal.distributionAmount ?? 0;
  const claimed = proposal.distributionClaimed ?? 0;
  const snapshot = proposal.distributionSnapshotDeposits ?? 0;
  const remaining = Math.max(0, total - claimed);
  const claimable = proposal.claimableAmount ?? 0;
  const hasClaimed = Boolean(proposal.hasClaimed);
  // Live private depositors have no public record, so `claimable` reads 0 even
  // when they have a share. Don't show that misleading €0 — explain the share is
  // private and let them claim. (False in sim / for public records, where the
  // claimable figure is real.)
  const privateClaim = Boolean(proposal.hasPrivateDeposits);

  if (!opened) {
    return (
      <EmptyState
        title="Distribution not open yet"
        description="Once this request is approved and executed, the fund opens a distribution against a snapshot of depositors. Allocations and your claimable share will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid cols={3}>
        <KpiCard label="Fund Shares pool" value={formatFSFT(total)} />
        <KpiCard label="Claimed so far" value={formatFSFT(claimed)} />
        <KpiCard label="Still unclaimed" value={formatFSFT(remaining)} />
      </KpiGrid>

      <p className="text-caption text-text-2">
        A distribution pays out <span className="font-semibold text-text-1">Fund Shares (FSFT)</span> —
        your ownership stake in the property, minted to depositors pro-rata. It is not a cash payout;
        rent income is the separate EUR stream.
      </p>

      <Section
        title="How the allocation is split"
        description="The split is computed privately in-circuit when you claim, so balances stay confidential."
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-text-2">
          <li>
            The pool is measured against a snapshot of total deposits
            {snapshot > 0 ? (
              <>
                {" "}
                of <span className="text-mono text-text-1">{formatEUR(snapshot)}</span>
              </>
            ) : null}{" "}
            taken when the distribution opened.
          </li>
          <li>
            A <span className="font-semibold text-text-1">30% small-balance floor</span> is
            set aside first and shared so smaller depositors receive a meaningful payout
            rather than a negligible pro-rata sliver.
          </li>
          <li>
            The remaining <span className="font-semibold text-text-1">70%</span> is allocated
            first-in, first-out (FIFO) by deposit order, up to a per-claim cap, so earlier
            depositors are served first until the pool is exhausted.
          </li>
        </ul>
      </Section>

      <Section title="Your claim">
        {!isConnected ? (
          <p className="text-caption">Connect your wallet to see your claimable share.</p>
        ) : hasClaimed ? (
          <Alert tone="success" title="Already claimed">
            You have claimed your share of this distribution.
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="surface-muted p-4">
              <p className="text-label">Your claimable share</p>
              {privateClaim ? (
                <>
                  <p className="text-body mt-1 font-semibold text-text-1">
                    Computed privately when you claim
                  </p>
                  <p className="text-caption mt-1">
                    Your deposits are private, so your exact share isn&rsquo;t shown here — it&rsquo;s
                    calculated in-circuit at claim time, and claiming sweeps every one of your
                    deposit notes.
                    {remaining > 0 ? ` ${formatFSFT(remaining)} of the pool is still unclaimed.` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-kpi mt-1 text-text-1">{formatFSFT(claimable)}</p>
                  <p className="text-caption mt-1">
                    The exact amount is determined privately in-circuit at claim time.
                  </p>
                </>
              )}
            </div>
            <Button onClick={onClaim} loading={isClaiming} disabled={isClaiming || remaining === 0}>
              {isClaiming ? "Claiming…" : "Claim distribution"}
            </Button>
            {remaining === 0 ? (
              <p className="text-caption">The pool is fully claimed.</p>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}
