import { StatusChip, type StatusKind } from "@/components/ui";
import { displayStatus } from "@/lib/proposalLifecycle";
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
 * Once an executed proposal opens its distribution, the payout lifecycle takes
 * precedence (Distributing → Fully claimed) because that is the more current,
 * more useful truth for a funded home.
 */
export function projectStatus(row: ProjectRow): { status: StatusKind; label: string } {
  if (row.distributionOpened) {
    const amount = row.distributionAmount ?? 0;
    const claimed = row.distributionClaimed ?? 0;
    if (amount > 0 && claimed >= amount) {
      return { status: "claimed", label: "Fully claimed" };
    }
    return { status: "open", label: "Distributing" };
  }

  // Reuse the governance board's lifecycle mapping verbatim.
  const gov = displayStatus(row.proposal);
  const FALLBACK_LABEL: Record<string, string> = {
    active: "Voting open",
    passed: "Approved",
    failed: "Rejected",
    executed: "Funded",
    pending: "Voting ended",
  };
  return {
    status: gov.kind,
    label: gov.label ?? FALLBACK_LABEL[gov.kind] ?? gov.kind,
  };
}

export function ProjectStatusChip({ row }: { row: ProjectRow }) {
  const { status, label } = projectStatus(row);
  return <StatusChip status={status} label={label} />;
}
