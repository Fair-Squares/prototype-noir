"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, DataTable, EmptyState, StatusChip, Tooltip, type Column } from "@/components/ui";
import { formatEUR, runMatchNext, type FundingQueueEntry } from "@/lib/contracts";

export interface FundingQueueProps {
  entries: FundingQueueEntry[];
  loading: boolean;
  /** Called after a successful match so the parent can reload fund state. */
  onMatched: () => Promise<void> | void;
}

/** J4 selection key — mirrors Governance.get_proposal_priority_public. */
function priority(e: FundingQueueEntry): number {
  return e.qualityScore * 1_000_000_000 + Math.min(e.discountEur, 999_999_999);
}

function rankExplanation(e: FundingQueueEntry): string {
  const parts = [
    `Council quality score ${e.qualityScore}/100 ranks first`,
    e.discountEur > 0
      ? `covenant rent sits €${e.discountEur.toLocaleString("en-IE")}/mo below the 20% baseline cap (deeper discount breaks score ties)`
      : "no covenant discount recorded yet (ties break by queue order)",
    "older queue entries win remaining ties",
  ];
  return parts.join("; ") + ".";
}

/**
 * J4: the funding queue — every PASSED listing-backed proposal awaiting
 * capital, in matching order. Anyone can run the matcher: authority comes from
 * the investor vote and the fund's balance check, not the caller.
 */
export function FundingQueue({ entries, loading, onMatched }: FundingQueueProps) {
  const [matching, setMatching] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const ranked = useMemo(
    () => [...entries].sort((a, b) => priority(b) - priority(a)),
    [entries]
  );

  const handleMatch = async () => {
    setMatching(true);
    setNotice(null);
    try {
      const result = await runMatchNext();
      setNotice({
        tone: "success",
        text:
          result.message ??
          (result.fundedProposalId != null
            ? `Matched proposal #${result.fundedProposalId}.`
            : "Matching ran."),
      });
      await onMatched();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setMatching(false);
    }
  };

  const columns: Column<FundingQueueEntry>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (row, index) => (
        <Tooltip content={rankExplanation(row)}>
          <span className="text-mono cursor-help underline decoration-dotted underline-offset-4">
            #{index + 1}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "proposal",
      header: "Proposal",
      render: (row) => (
        <Link href={`/governance/${row.proposalId}`} className="text-fs-teal-dark hover:underline">
          {row.title ?? `Listing #${row.listingId} acquisition`}
        </Link>
      ),
    },
    {
      key: "qualityScore",
      header: "Council score",
      align: "right",
      render: (row) => <span className="text-mono">{row.qualityScore}/100</span>,
    },
    {
      key: "discountEur",
      header: "Extra discount",
      align: "right",
      hideOnMobile: true,
      render: (row) =>
        row.discountEur > 0 ? (
          <span className="text-mono">€{row.discountEur.toLocaleString("en-IE")}/mo</span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
    {
      key: "askEur",
      header: "Ask",
      align: "right",
      render: (row) => <span className="text-mono">{formatEUR(row.askEur)}</span>,
    },
    {
      key: "fundable",
      header: "Fundable",
      render: (row) =>
        row.fundable ? (
          <StatusChip status="verified" label="Fundable now" />
        ) : (
          <StatusChip status="pending" label="Awaiting capital" />
        ),
    },
  ];

  return (
    <section aria-labelledby="funding-queue-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="funding-queue-heading" className="text-heading text-text-1">
            Funding queue
          </h2>
          <p className="text-caption mt-1 text-text-2">
            Approved-and-voted homes fund by priority — best council score first, deeper
            affordability discount second, oldest first on ties. Anyone can run the matcher.
          </p>
        </div>
        {ranked.length > 0 ? (
          <Button
            size="sm"
            onClick={() => void handleMatch()}
            disabled={matching || loading || !ranked.some((e) => e.fundable)}
            loading={matching}
          >
            Run matching
          </Button>
        ) : null}
      </div>

      <div aria-live="polite">
        {notice ? (
          <Alert
            tone={notice.tone}
            title={notice.tone === "success" ? "Matching ran" : "Could not match"}
          >
            {notice.text}
          </Alert>
        ) : null}
      </div>

      {ranked.length === 0 ? (
        <EmptyState
          title="No proposals waiting for capital"
          description="Listing-backed proposals join this queue automatically when their investor vote passes; the matcher funds the best affordable one."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={ranked}
          rowKey={(row) => row.proposalId}
          caption="Funding queue, ranked by matching priority"
          dense
        />
      )}
    </section>
  );
}
