"use client";

import { useState } from "react";
import { Alert, Button, DataTable, Section, type Column } from "@/components/ui";
import { councilReview, formatEUR, type Listing } from "@/lib/contracts";

export interface CouncilQueueProps {
  address: string;
  accountIndex: number;
  /** All listings; the queue filters to SUBMITTED (status 1) itself. */
  listings: Listing[];
  /** Called after a successful approve/reject so the parent can refetch. */
  onReviewed: () => void;
}

/**
 * J2: the housing council's review queue (journey step 3a). Council members
 * score price-quality 0-100 and approve, or reject (final). Only SUBMITTED
 * listings appear; role gating is enforced on-chain and mirrored by the parent
 * (this component renders only for council members).
 */
export function CouncilQueue({ address, accountIndex, listings, onReviewed }: CouncilQueueProps) {
  const queue = listings.filter((l) => l.status === 1);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const review = async (listingId: number, action: "approve" | "reject") => {
    const scoreRaw = scores[listingId] ?? "";
    const score = Number(scoreRaw);
    if (action === "approve" && (!scoreRaw.trim() || !Number.isInteger(score) || score < 0 || score > 100)) {
      setNotice({ tone: "danger", text: `Listing #${listingId}: enter a whole quality score from 0 to 100 before approving.` });
      return;
    }
    setBusyId(listingId);
    setNotice(null);
    try {
      const result = await councilReview(address, listingId, action, action === "approve" ? score : undefined, accountIndex);
      setNotice({ tone: "success", text: result.message ?? `Listing #${listingId} ${action}d.` });
      onReviewed();
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<Listing>[] = [
    { key: "id", header: "Listing", render: (l) => <span className="text-mono">#{l.id}</span> },
    {
      key: "askEur",
      header: "Capital ask",
      align: "right",
      render: (l) => <span className="text-mono">{formatEUR(l.askEur)}</span>,
    },
    {
      key: "marketRentRefEur",
      header: "Market rent",
      align: "right",
      render: (l) => <span className="text-mono">€{l.marketRentRefEur.toLocaleString("en-IE")}/mo</span>,
    },
    {
      key: "dossierHash",
      header: "Dossier",
      hideOnMobile: true,
      render: (l) => (
        <span className="text-mono text-body-sm text-text-3" title={l.dossierHash}>
          {l.dossierHash.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: "score",
      header: "Quality score",
      render: (l) => (
        <input
          type="number"
          min="0"
          max="100"
          inputMode="numeric"
          aria-label={`Quality score for listing ${l.id}`}
          value={scores[l.id] ?? ""}
          onChange={(e) => setScores((s) => ({ ...s, [l.id]: e.target.value }))}
          disabled={busyId !== null}
          className="h-9 w-20 rounded-md border border-border-strong bg-card px-2 text-body text-mono text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
        />
      ),
    },
    {
      key: "actions",
      header: "Review",
      align: "right",
      render: (l) => (
        <span className="flex justify-end gap-2">
          <Button size="sm" onClick={() => void review(l.id, "approve")} disabled={busyId !== null} loading={busyId === l.id}>
            Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => void review(l.id, "reject")} disabled={busyId !== null}>
            Reject
          </Button>
        </span>
      ),
    },
  ];

  return (
    <Section
      title="Council review queue"
      description="Score each listing's price-quality (0-100) and approve it for an investor vote, or reject it. A rejection is final; owners can resubmit an amended dossier as a new listing."
    >
      {notice && <Alert tone={notice.tone} className="mb-3">{notice.text}</Alert>}
      <DataTable
        columns={columns}
        rows={queue}
        rowKey={(l) => l.id}
        caption="Property listings awaiting council review"
        empty={{
          title: "No listings awaiting review",
          description: "New submissions from property owners appear here for the two-stage assessment.",
        }}
      />
    </Section>
  );
}
