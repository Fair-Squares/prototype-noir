import Link from "next/link";
import { InfoDot, StatusChip } from "@/components/ui";
import {
  displayStatus,
  quorumFor,
  votingWindowFor,
} from "@/components/governance/governanceStatus";
import {
  type GovernanceEligibility,
  type Proposal,
} from "@/lib/contracts";
import { ProjectDetailMeter } from "./ProjectDetailMeter";

/**
 * Governance tab. The reader-facing slice of the on-chain vote: the yes/no
 * tally and quorum, the reader's own standing (can they vote, and why / why
 * not), and a prominent link into the full governance memo where the ballot is
 * actually cast. All figures come from the proposal and the eligibility fetch.
 */
export function ProjectDetailGovernance({
  proposal,
  eligibility,
  isConnected,
}: {
  proposal: Proposal;
  eligibility: GovernanceEligibility | null;
  isConnected: boolean;
}) {
  const status = displayStatus(proposal);
  const quorum = quorumFor(proposal);
  const window = votingWindowFor(proposal);
  const isActive = proposal.status === 0;
  const totalCast = proposal.yesVotes + proposal.noVotes;
  const yesFraction = totalCast > 0 ? proposal.yesVotes / totalCast : 0;

  return (
    <div className="space-y-5">
      <section className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-heading text-text-1">Vote tally</h2>
          <StatusChip status={status.kind} label={status.label} />
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-label">In favour</dt>
            <dd className="text-kpi-sm mt-0.5 text-mono text-text-1">
              {proposal.yesVotes.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-label">Against</dt>
            <dd className="text-kpi-sm mt-0.5 text-mono text-text-1">
              {proposal.noVotes.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-label inline-flex items-center gap-1">
              Quorum
              <InfoDot
                label="What is quorum"
                content="The minimum number of ballots required for the vote to count. Until quorum is reached, the request cannot pass regardless of the yes/no split."
              />
            </dt>
            <dd className="text-kpi-sm mt-0.5 text-mono text-text-1">
              {quorum.total.toLocaleString()} / {quorum.required.toLocaleString()}
            </dd>
            <dd className="text-caption mt-0.5 text-text-2">
              {quorum.reached ? "Quorum met" : "Quorum not yet met"}
            </dd>
          </div>
        </dl>

        {totalCast > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <ProjectDetailMeter fraction={yesFraction} tone="success" />
            <p className="text-caption text-text-2">
              <span className="text-mono text-text-1">
                {Math.round(yesFraction * 100)}%
              </span>{" "}
              of {totalCast.toLocaleString()} ballots cast are in favour.
            </p>
          </div>
        ) : (
          <p className="text-caption mt-4 text-text-2">No ballots cast yet.</p>
        )}

        <p className="text-caption mt-4 text-text-2">
          {isActive
            ? window.closed
              ? "Voting window closed; awaiting finalisation."
              : `${window.remainingLabel} remaining · closes at block ${window.deadlineBlock.toLocaleString()}.`
            : "Voting has concluded for this request."}
        </p>
      </section>

      <section className="surface p-5">
        <h2 className="text-heading text-text-1">Your standing</h2>
        {!isConnected ? (
          <p className="text-caption mt-1 text-text-2">
            Connect a wallet to see whether you are cleared to vote on this
            request.
          </p>
        ) : eligibility === null ? (
          <p className="text-caption mt-1 text-text-2">
            Checking your voting eligibility…
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-body text-text-1">
              {eligibility.canVote
                ? "You are cleared to vote on this request."
                : "You are not yet cleared to vote on this request."}
            </p>
            {eligibility.reason ? (
              <p className="text-caption text-text-2">{eligibility.reason}</p>
            ) : null}
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-caption text-text-2">Investor role</dt>
                <dd className="text-meta text-text-1">
                  {eligibility.investorRole ? "Yes" : "No"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-caption text-text-2">Deposit ticket</dt>
                <dd className="text-meta text-text-1">
                  {eligibility.hasDepositTicket ? "Yes" : "No"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-caption text-text-2">Fund Shares exposure</dt>
                <dd className="text-meta text-text-1">
                  {eligibility.hasFsftExposure ? "Yes" : "No"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-caption text-text-2">Shares attested</dt>
                <dd className="text-meta text-text-1">
                  {eligibility.hasFsftVotingAttestation ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <Link href={`/governance/${proposal.id}`} className="btn btn-primary btn-sm">
        {isActive && !window.closed ? "Review & vote in the memo" : "Open governance memo"}
      </Link>
    </div>
  );
}
