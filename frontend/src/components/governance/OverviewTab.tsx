"use client";

import { Alert, Button, KpiCard, KpiGrid, Section, StatusChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import { VotePanel } from "./VotePanel";
import { displayStatus, quorumFor, votingWindowFor } from "@/lib/proposalLifecycle";

export interface OverviewTabProps {
  proposal: Proposal;
  isConnected: boolean;
  canVote: boolean;
  hasVoted: boolean;
  isVoting: boolean;
  eligibilityReason?: string;
  onVote: (voteYes: boolean) => void;
  /** §4.6 inline gate: the one-time private eligibility check, offered in place. */
  onRunCheck?: () => void;
  isRunningCheck?: boolean;
  /** Finalise the tally once voting has ended (status ACTIVE, window closed). */
  onFinalize: () => void;
  isFinalizing: boolean;
  /** Execute the passed proposal + open its distribution. Closed-window only. */
  onExecute: () => void;
  isExecuting: boolean;
  /**
   * Keeper actions (record result / deploy capital) render only for admin
   * accounts (UX overhaul §4.6). UI gating only — M16: the demo has no real
   * per-user auth, so this is presentation, not security.
   */
  isAdmin: boolean;
}

/**
 * Overview tab: the funding ask, the live tally, and the pass/fail maths in
 * plain language. When the window has closed and the proposal passed but is not
 * yet executed, surfaces the execute / open-distribution action.
 */
export function OverviewTab({
  proposal,
  isConnected,
  canVote,
  hasVoted,
  isVoting,
  eligibilityReason,
  onVote,
  onRunCheck,
  isRunningCheck,
  onFinalize,
  isFinalizing,
  onExecute,
  isExecuting,
  isAdmin,
}: OverviewTabProps) {
  const window = votingWindowFor(proposal);
  const quorum = quorumFor(proposal);
  const status = displayStatus(proposal);
  const isActive = proposal.status === 0;
  // Active on-chain but the deadline block has passed: voting is effectively over.
  const votingEnded = isActive && window.closed;
  const wouldPass = quorum.reached && quorum.majorityYes;
  // A passed-but-not-executed proposal (status 1) is what the execute action
  // acts on; failed (2) and executed (3) are terminal. J4: listing-backed
  // proposals fund via the permissionless matching queue instead — the admin
  // execute path stays for legacy direct proposals only.
  const isListingBacked = proposal.listingId != null;
  const canExecute = proposal.status === 1 && !isListingBacked;
  const isQueuedForMatching = proposal.status === 1 && isListingBacked;

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <KpiCard label="Funding request" value={formatEUR(proposal.amount)} />
        <KpiCard
          label="In favour"
          value={quorum.yes.toLocaleString()}
          tone="success"
        />
        <KpiCard label="Against" value={quorum.no.toLocaleString()} />
        <KpiCard
          label="Status"
          value={<StatusChip status={status.kind} label={status.label} />}
        />
      </KpiGrid>

      <Section
        title="What it takes to pass"
        description="A request passes when it reaches quorum and more ballots are in favour than against."
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="surface-muted p-4">
            <dt className="text-label">Quorum</dt>
            <dd className="text-body mt-1 text-mono text-text-1">
              {quorum.total.toLocaleString()} of {quorum.required.toLocaleString()} ballots
            </dd>
            <dd className="text-caption mt-1">
              {quorum.reached ? "Quorum met." : "Quorum not yet met."}
            </dd>
          </div>
          <div className="surface-muted p-4">
            <dt className="text-label">Majority</dt>
            <dd className="text-body mt-1 text-text-1">
              {quorum.yes.toLocaleString()} in favour vs {quorum.no.toLocaleString()} against
            </dd>
            <dd className="text-caption mt-1">
              {quorum.majorityYes
                ? "In favour leads."
                : quorum.yes === quorum.no
                  ? "Tied."
                  : "Against leads."}
            </dd>
          </div>
        </dl>

        <p className="text-body mt-4 text-text-1">
          {isActive
            ? wouldPass
              ? "On track to pass if the window closed now."
              : "Would not pass yet — needs more support and/or more ballots to reach quorum."
            : `Final outcome: ${
                proposal.status === 1
                  ? "approved"
                  : proposal.status === 2
                    ? "rejected"
                    : "approved and funded"
              }.`}
        </p>
      </Section>

      <Section title="Voting window">
        <p className="text-body text-text-1">
          {votingEnded ? (
            <>
              Voting closed at <span className="text-mono">{window.closesAtLabel}</span> —{" "}
              {quorum.reached
                ? "this request can now be finalised."
                : "it did not reach quorum, so it can’t be finalised or funded."}
            </>
          ) : isActive ? (
            <>
              Closes at <span className="text-mono">{window.closesAtLabel}</span> ·{" "}
              <span className="text-mono">{window.remainingLabel}</span> remaining
            </>
          ) : (
            <>
              Window closed at <span className="text-mono">{window.closesAtLabel}</span>.
            </>
          )}
        </p>
        {isActive && !window.closed && window.onDemand ? (
          <p className="text-caption mt-2">
            Locally the window is measured in blocks, and blocks advance as transactions happen
            (automine) — a few seconds each — so it closes much sooner than wall-clock time
            would suggest.
          </p>
        ) : null}
      </Section>

      <Section title="Your ballot">
        <VotePanel
          proposal={proposal}
          isConnected={isConnected}
          canVote={canVote}
          hasVoted={hasVoted}
          isVoting={isVoting}
          eligibilityReason={eligibilityReason}
          windowClosed={window.closed}
          onVote={onVote}
          onRunCheck={onRunCheck}
          isRunningCheck={isRunningCheck}
        />
      </Section>

      {votingEnded ? (
        quorum.reached ? (
          isAdmin ? (
            <Section
              title="Record the result"
              description={
                wouldPass
                  ? "Voting has closed with quorum met and the majority in favour. Record the result on-chain (approved) — then deploy the capital to open the payout so depositors can claim."
                  : "Voting has closed with quorum met, but the majority was against. Recording will mark this request as not passed."
              }
            >
              <Button onClick={onFinalize} loading={isFinalizing}>
                {isFinalizing ? "Recording…" : wouldPass ? "Record result — approve request" : "Record result — close voting"}
              </Button>
            </Section>
          ) : (
            // §4.6: recording the result is a keeper operation — ordinary
            // investors see the state, not the lever.
            <Alert tone="info" title="Voting ended — awaiting the result">
              {wouldPass
                ? "Quorum was met and the majority is in favour. The fund administrator records the result next; once the capital is deployed, claims appear in your Portfolio."
                : "Quorum was met, but the majority was against. The fund administrator records the result to close this request."}
            </Alert>
          )
        ) : (
          // Quorum was not reached, so finalize_proposal would revert on-chain.
          // Don't offer a button that fails — explain the terminal state instead.
          <Alert tone="warning" title="Can't finalise — not enough votes">
            Voting closed at{" "}
            <span className="text-mono">{window.closesAtLabel}</span> with{" "}
            {quorum.total.toLocaleString()} of {quorum.required.toLocaleString()} ballots cast. This
            request did not reach quorum, so it can&rsquo;t be finalised or funded.
          </Alert>
        )
      ) : null}

      {isQueuedForMatching ? (
        <Section
          title="Approved — queued for funding"
          description="This request passed its investor vote and joined the funding queue automatically. It funds by priority — best council score first, deeper affordability discount second — as soon as the pool can afford it. Anyone can run the matcher from the deal room."
        >
          <a href="/fund" className="btn btn-secondary btn-sm">
            View the funding queue
          </a>
        </Section>
      ) : null}

      {canExecute ? (
        isAdmin ? (
          <Section
            title="Deploy the capital"
            description="This request was approved. Deploying commits the fund's capital and opens the payout so depositors can claim their fund shares."
          >
            <Button onClick={onExecute} loading={isExecuting}>
              {isExecuting ? "Deploying…" : "Deploy capital & open payout"}
            </Button>
          </Section>
        ) : (
          <Alert tone="info" title="Approved — awaiting capital deployment">
            The fund administrator deploys the capital and opens the payout.
            Your claim appears in your Portfolio once it opens.
          </Alert>
        )
      ) : null}

      {proposal.status === 2 ? (
        <Alert tone="warning" title="Request rejected">
          This funding request did not pass. No capital is committed.
        </Alert>
      ) : null}
    </div>
  );
}
