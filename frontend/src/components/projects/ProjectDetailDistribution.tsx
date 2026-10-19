import { InfoDot, StatusChip } from "@/components/ui";
import { PAYOUT_LABELS, quorumFor, votingWindowFor } from "@/lib/proposalLifecycle";
import {
  formatEUR,
  formatFSFT,
  type Proposal,
  type PropertyDeed,
} from "@/lib/contracts";
import { ProjectDetailMeter } from "./ProjectDetailMeter";
import { ReturnsCapPanel } from "./ReturnsCapPanel";

/**
 * Distribution / Capital tab. Two honest states:
 *  - Pre-funding (no distribution opened): show the committee maths — quorum and
 *    the voting window — because there is no pool to report yet.
 *  - Post-funding (distribution opened): show the realised pool and how much of
 *    it depositors have claimed, plus the on-chain property deed when it exists.
 * Every figure is sourced from the proposal or the PropertyDeed; nothing is
 * estimated.
 */
export function ProjectDetailDistribution({
  proposal,
  deed,
}: {
  proposal: Proposal;
  deed: PropertyDeed | null;
}) {
  const opened = Boolean(proposal.distributionOpened);
  const pool = proposal.distributionAmount ?? 0;
  const claimed = proposal.distributionClaimed ?? 0;
  const fraction = pool > 0 ? Math.min(1, claimed / pool) : null;
  const quorum = quorumFor(proposal);
  const window = votingWindowFor(proposal);
  const isActive = proposal.status === 0;

  return (
    <div className="space-y-5">
      <ReturnsCapPanel variant="compact" />

      {opened ? (
        <section className="surface p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <h2 className="text-heading inline-flex items-center gap-1 text-text-1">
              Payout to depositors
              <InfoDot
                label="What is the payout"
                content="When a funded home's value is realised, the proceeds open as a pool that depositors claim pro-rata against the deposits snapshotted at that moment."
              />
            </h2>
            <span className="text-mono text-text-1">{formatFSFT(pool)}</span>
          </div>

          {fraction !== null ? (
            <div className="mt-3 flex flex-col gap-2">
              <ProjectDetailMeter
                fraction={fraction}
                tone={fraction >= 1 ? "success" : "accent"}
              />
              <p className="text-caption text-text-2">
                <span className="text-mono text-text-1">{formatFSFT(claimed)}</span>{" "}
                of <span className="text-mono text-text-1">{formatFSFT(pool)}</span>{" "}
                claimed
                {fraction >= 1 ? " — fully distributed." : "."}
              </p>
            </div>
          ) : (
            <p className="text-caption mt-2 text-text-2">
              The distribution is open; no pool amount has been recorded yet.
            </p>
          )}

          {typeof proposal.distributionSnapshotDeposits === "number" ? (
            <dl className="mt-4 border-t border-border pt-4">
              <dt className="text-label inline-flex items-center gap-1">
                Snapshot deposits
                <InfoDot
                  label="What is the snapshot"
                  content="The total depositor balance recorded the moment the payout opened. Each depositor's claimable share is their slice of this snapshot."
                />
              </dt>
              <dd className="text-body mt-0.5 text-mono text-text-1">
                {formatEUR(proposal.distributionSnapshotDeposits)}
              </dd>
            </dl>
          ) : null}
        </section>
      ) : (
        <section className="surface p-5">
          <h2 className="text-heading text-text-1">Before funding</h2>
          <p className="text-caption mt-0.5 text-text-2">
            No distribution is open yet. Until the committee approves and the
            acquisition completes, the live figures are the vote&apos;s quorum and
            timing.
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-label inline-flex items-center gap-1">
                Quorum
                <InfoDot
                  label="What is quorum"
                  content="The minimum number of ballots required for the vote to count. Until quorum is reached, the request cannot pass regardless of the yes/no split."
                />
              </dt>
              <dd className="text-body mt-0.5 text-mono text-text-1">
                {quorum.total.toLocaleString()} / {quorum.required.toLocaleString()}
              </dd>
              <dd className="text-caption mt-0.5 text-text-2">
                {quorum.reached ? "Quorum met" : "Quorum not yet met"}
              </dd>
            </div>
            <div>
              <dt className="text-label">Voting window</dt>
              <dd className="text-body mt-0.5 text-text-1">
                {isActive ? window.remainingLabel : "Closed"}
              </dd>
              <dd className="text-caption mt-0.5 text-mono text-text-2">
                Closes at {window.closesAtLabel}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-heading text-text-1">On-chain property deed</h2>
          {deed ? (
            deed.distributionOpen ? (
              <StatusChip status="active" label={`Held · ${PAYOUT_LABELS.payingOut.toLowerCase()}`} />
            ) : (
              <StatusChip status="ready" label="Held by fund" />
            )
          ) : (
            <StatusChip status="pending" label="Not yet minted" />
          )}
        </div>

        {deed ? (
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-label inline-flex items-center gap-1">
                Deed token
                <InfoDot
                  label="What is the deed"
                  content="A property deed (NFT) minted to the fund when the acquisition completes. It is the on-chain record that the fund holds this property."
                />
              </dt>
              <dd className="text-body mt-0.5 text-mono text-text-1">#{deed.tokenId}</dd>
            </div>
            <div>
              <dt className="text-label">Recorded valuation</dt>
              <dd className="text-body mt-0.5 text-mono text-text-1">
                {deed.valuationEur > 0 ? formatEUR(deed.valuationEur) : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-caption mt-2 max-w-prose text-text-2">
            The property deed is minted to the fund only when this request is
            approved and the home is acquired. Until then there is no deed to
            show.
          </p>
        )}
      </section>
    </div>
  );
}
