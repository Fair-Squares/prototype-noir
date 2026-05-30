"use client";

import { Alert, Button, KpiCard, KpiGrid, Section, StatusChip } from "@/components/ui";
import { formatEUR, type Proposal } from "@/lib/contracts";
import { VotePanel } from "./VotePanel";
import { displayStatus, quorumFor, votingWindowFor } from "./governanceStatus";

export interface OverviewTabProps {
  proposal: Proposal;
  isConnected: boolean;
  canVote: boolean;
  hasVoted: boolean;
  isVoting: boolean;
  eligibilityReason?: string;
  onVote: (voteYes: boolean) => void;
  /** Finalise the tally once voting has ended (status ACTIVE, window closed). */
  onFinalize: () => void;
  isFinalizing: boolean;
  /** Execute the passed proposal + open its distribution. Closed-window only. */
  onExecute: () => void;
  isExecuting: boolean;
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
  onFinalize,
  isFinalizing,
  onExecute,
  isExecuting,
}: OverviewTabProps) {
  const window = votingWindowFor(proposal);
  const quorum = quorumFor(proposal);
  const status = displayStatus(proposal);
  const isActive = proposal.status === 0;
  // Active on-chain but the deadline block has passed: voting is effectively over.
  const votingEnded = isActive && window.closed;
  const wouldPass = quorum.reached && quorum.majorityYes;
  // A passed-but-not-executed proposal (status 1) is what the execute action
  // acts on; failed (2) and executed (3) are terminal.
  const canExecute = proposal.status === 1;

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
              Voting closed at block{" "}
              <span className="text-mono">{window.deadlineBlock.toLocaleString()}</span> — this
              request can now be finalised.
            </>
          ) : isActive ? (
            <>
              Closes at block{" "}
              <span className="text-mono">{window.deadlineBlock.toLocaleString()}</span> ·{" "}
              <span className="text-mono">{window.blocksRemaining.toLocaleString()}</span> block
              {window.blocksRemaining === 1 ? "" : "s"} remaining
            </>
          ) : (
            <>
              Window closed at block{" "}
              <span className="text-mono">{window.deadlineBlock.toLocaleString()}</span>.
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
        />
      </Section>

      {votingEnded ? (
        <Section
          title="Finalise the vote"
          description={
            wouldPass
              ? "Voting has closed with quorum met and the majority in favour. Finalise to record the result on-chain (approved) — then you can execute it to open the distribution and depositors can claim."
              : "Voting has closed, but quorum or majority was not reached. Finalising will record this request as not passed."
          }
        >
          <Button onClick={onFinalize} loading={isFinalizing}>
            {isFinalizing ? "Finalising…" : wouldPass ? "Finalise — approve request" : "Finalise — close voting"}
          </Button>
        </Section>
      ) : null}

      {canExecute ? (
        <Section
          title="Finalise & fund"
          description="This request was approved. Executing it commits the fund's capital and opens the distribution so depositors can claim their Fund Shares."
        >
          <Button onClick={onExecute} loading={isExecuting}>
            {isExecuting ? "Executing…" : "Execute & open distribution"}
          </Button>
        </Section>
      ) : null}

      {proposal.status === 2 ? (
        <Alert tone="warning" title="Request rejected">
          This funding request did not pass. No capital is committed.
        </Alert>
      ) : null}
    </div>
  );
}
