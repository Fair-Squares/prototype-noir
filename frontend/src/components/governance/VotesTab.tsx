import { DataTable, Section, type Column } from "@/components/ui";
import type { Proposal } from "@/lib/contracts";
import { quorumFor } from "@/lib/proposalLifecycle";

export interface VotesTabProps {
  proposal: Proposal;
}

interface TallyRow {
  label: string;
  count: number;
  share: string;
}

/**
 * Votes tab. Shows the public tally — counts only, never identities, because
 * ballots are private. Quorum progress is derived from the same on-chain
 * totals.
 */
export function VotesTab({ proposal }: VotesTabProps) {
  const quorum = quorumFor(proposal);
  const total = quorum.total;

  const share = (count: number): string =>
    total > 0 ? `${Math.round((count / total) * 100)}%` : "—";

  const rows: TallyRow[] = [
    { label: "In favour", count: quorum.yes, share: share(quorum.yes) },
    { label: "Against", count: quorum.no, share: share(quorum.no) },
  ];

  const columns: Column<TallyRow>[] = [
    { key: "label", header: "Ballots" },
    {
      key: "count",
      header: "Count",
      align: "right",
      render: (row) => <span className="text-mono">{row.count.toLocaleString()}</span>,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      render: (row) => <span className="text-mono">{row.share}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <Section
        title="Tally"
        description="Ballots are private — only the running totals are public, never who voted which way."
      >
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.label} />
      </Section>

      <Section title="Quorum progress">
        <p className="text-body text-text-1">
          <span className="text-mono">{total.toLocaleString()}</span> of{" "}
          <span className="text-mono">{quorum.required.toLocaleString()}</span> ballots needed.
        </p>
        <div
          className="surface-muted mt-3 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={quorum.required}
          aria-valuenow={Math.min(total, quorum.required)}
          aria-label="Quorum progress"
        >
          <div
            className="h-full rounded-full bar-success"
            style={{
              width: `${quorum.required > 0 ? Math.min(100, (total / quorum.required) * 100) : 0}%`,
            }}
          />
        </div>
        <p className="text-caption mt-2">
          {quorum.reached ? "Quorum met." : "Quorum not yet met."}
        </p>
      </Section>
    </div>
  );
}
