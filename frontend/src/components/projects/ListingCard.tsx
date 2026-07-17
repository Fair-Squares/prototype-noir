"use client";

import Link from "next/link";
import { StatusChip, type StatusKind } from "@/components/ui";
import { RentComparison } from "@/components/projects/RentComparison";
import { formatEUR, type Listing } from "@/lib/contracts";

export interface ListingCardProps {
  listing: Listing;
  /** Covenant-capped MONTHLY rent (EUR) when the backing proposal has a
   *  covenant — enables the J3 rent comparison line. */
  cappedMonthlyRentEur?: number;
  /** Rendered for COUNCIL_APPROVED listings (e.g. "open investor vote"). */
  action?: React.ReactNode;
  /** S1: the shared home-lifecycle strip, rendered under the header. */
  lifecycle?: React.ReactNode;
  className?: string;
}

/** Listing status (contract codes) → chip + label. Nonzero by design. */
const LISTING_CHIP: Record<number, { status: StatusKind; label: string }> = {
  1: { status: "pending", label: "Awaiting council review" },
  2: { status: "ready", label: "Council approved" },
  3: { status: "active", label: "Investor vote open" },
  4: { status: "failed", label: "Rejected by council" },
};

/**
 * J1: a submitted property listing — the journey's step-2 card. Shows the
 * capital ask, the attested market rent (the J3 baseline anchor), the dossier
 * commitment, and council review progress.
 */
export function ListingCard({ listing, cappedMonthlyRentEur, action, lifecycle, className }: ListingCardProps) {
  const chip = LISTING_CHIP[listing.status] ?? { status: "pending" as StatusKind, label: listing.statusName };

  return (
    <article className={`rounded-lg border border-border bg-card p-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-heading text-text-1">Home listing #{listing.id}</h3>
          <p className="mt-0.5 text-body-sm text-text-3">
            Submitted by <span className="text-mono">{listing.proposer.slice(0, 10)}…</span>
          </p>
        </div>
        <StatusChip status={chip.status} label={chip.label} />
      </div>
      {lifecycle ? <div className="mt-2">{lifecycle}</div> : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-label text-text-3">Capital ask</dt>
          <dd className="text-mono text-body text-text-1">{formatEUR(listing.askEur)}</dd>
        </div>
        <div>
          <dt className="text-label text-text-3">Market rent (certified)</dt>
          <dd className="text-mono text-body text-text-1">
            €{listing.marketRentRefEur.toLocaleString("en-IE")}/mo
          </dd>
        </div>
        {listing.approvals > 0 && (
          <div>
            <dt className="text-label text-text-3">Council quality score</dt>
            <dd className="text-mono text-body text-text-1">
              {listing.qualityScore}/100 ({listing.approvals}{" "}
              {listing.approvals === 1 ? "approval" : "approvals"})
            </dd>
          </div>
        )}
        <div className={listing.approvals > 0 ? "" : "col-span-2"}>
          <dt className="text-label text-text-3">Dossier commitment</dt>
          <dd className="truncate text-mono text-body-sm text-text-2" title={listing.dossierHash}>
            {listing.dossierHash.slice(0, 18)}…
          </dd>
        </div>
      </dl>

      {cappedMonthlyRentEur !== undefined && (
        <RentComparison
          className="mt-3 border-t border-border pt-3"
          marketRentEur={listing.marketRentRefEur}
          cappedRentEur={cappedMonthlyRentEur}
        />
      )}

      {(action || listing.proposalId !== null) && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
          {listing.proposalId !== null && (
            <Link
              href={`/governance/${listing.proposalId}`}
              className="text-body-sm font-medium text-[var(--color-accent)] hover:underline"
            >
              View the investor vote
            </Link>
          )}
          {action}
        </div>
      )}
    </article>
  );
}
