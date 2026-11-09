import { StatusChip, type StatusKind } from "@/components/ui";
import { displayStatus, PAYOUT_LABELS } from "@/lib/proposalLifecycle";
import type { ProjectRow } from "./ProjectRow";

/**
 * A project's single lifecycle chip.
 *
 * Pre-funding, this defers entirely to the canonical governance
 * `displayStatus` so a project reads exactly as its proposal does in the
 * governance board — Active / Voting ended / Approved / Rejected / Funded —
 * including the honest "voting ended, awaiting finalisation" state that a naive
 * status-enum read would miss.
 *
 * Once an executed proposal opens its payout, the payout lifecycle takes
 * precedence (Paying out → Fully paid) because that is the more current,
 * more useful truth for a funded home.
 */
export function projectStatus(row: ProjectRow): { status: StatusKind; label: string } {
  if (row.distributionOpened) {
    const amount = row.distributionAmount ?? 0;
    const claimed = row.distributionClaimed ?? 0;
    if (amount > 0 && claimed >= amount) {
      return { status: "claimed", label: PAYOUT_LABELS.fullyPaid };
    }
    return { status: "open", label: PAYOUT_LABELS.payingOut };
  }

  // Reuse the governance board's canonical lifecycle label verbatim
  // (Voting open / Voting ended / Approved / Rejected / Funded).
  const gov = displayStatus(row.proposal);
  return { status: gov.kind, label: gov.label };
}

export function ProjectStatusChip({ row }: { row: ProjectRow }) {
  const { status, label } = projectStatus(row);
  return <StatusChip status={status} label={label} />;
}
