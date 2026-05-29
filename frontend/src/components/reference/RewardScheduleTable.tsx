import { DataTable, type Column } from "@/components/ui";
import type { RewardsOverview } from "@/lib/contracts";

type ScheduleRow = RewardsOverview["yearlySchedule"][number];

const COLUMNS: Column<ScheduleRow>[] = [
  {
    key: "year",
    header: "Year",
    render: (r) => <span className="text-mono text-body text-text-1">{r.year}</span>,
  },
  {
    key: "percent",
    header: "Curve %",
    align: "right",
    render: (r) => (
      <span className="text-mono text-body text-text-1">{r.percent.toLocaleString()}%</span>
    ),
  },
  {
    key: "tokens",
    header: "FSP emitted",
    align: "right",
    render: (r) => (
      <span className="text-mono text-body text-text-1">{r.tokens.toLocaleString()}</span>
    ),
  },
];

/**
 * The 10-year FSP emission curve straight from fetchRewardsOverview. Percent and
 * token columns are tabular so the front-loaded curve reads cleanly top to
 * bottom. The total row reconciles against the distribution pool.
 */
export function RewardScheduleTable({ overview }: { overview: RewardsOverview }) {
  const totalPercent = overview.yearlySchedule.reduce((sum, r) => sum + r.percent, 0);
  const totalTokens = overview.yearlySchedule.reduce((sum, r) => sum + r.tokens, 0);

  return (
    <div>
      <DataTable
        columns={COLUMNS}
        rows={overview.yearlySchedule}
        dense
        rowKey={(r) => r.year}
        caption="FSP yearly emission schedule"
      />
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-label">Total over {overview.token.years} years</span>
        <span className="text-mono text-body text-text-1">
          {totalPercent.toLocaleString()}% · {totalTokens.toLocaleString()} FSP
        </span>
      </div>
    </div>
  );
}
