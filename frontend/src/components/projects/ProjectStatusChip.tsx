import { StatusChip, type StatusKind } from "@/components/ui";
import type { ProjectRow } from "./ProjectRow";

/**
 * Maps a project's on-chain lifecycle to a single status chip. Distribution
 * state takes precedence once an executed proposal starts paying out, so a row
 * reads as Claimed / Distributing rather than just "Executed".
 */
export function projectStatus(row: ProjectRow): { status: StatusKind; label: string } {
  // Distribution lifecycle (only meaningful once a deed/payout exists).
  if (row.distributionOpened) {
    const amount = row.distributionAmount ?? 0;
    const claimed = row.distributionClaimed ?? 0;
    if (amount > 0 && claimed >= amount) {
      return { status: "claimed", label: "Fully claimed" };
    }
    return { status: "open", label: "Distributing" };
  }

  switch (row.status) {
    case 0:
      return { status: "active", label: "Voting open" };
    case 1:
      return { status: "passed", label: "Approved" };
    case 2:
      return { status: "failed", label: "Rejected" };
    case 3:
      return { status: "executed", label: "Funded" };
    default:
      return { status: "pending", label: "Pending" };
  }
}

export function ProjectStatusChip({ row }: { row: ProjectRow }) {
  const { status, label } = projectStatus(row);
  return <StatusChip status={status} label={label} />;
}
