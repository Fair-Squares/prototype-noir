export type StatusKind =
  | "active"
  | "pending"
  | "ready"
  | "blocked"
  | "passed"
  | "failed"
  | "executed"
  | "open"
  | "claimed"
  | "delayed"
  | "impaired"
  | "completed"
  | "breached"
  | "verified"
  | "simulation";

type ChipVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "alert"
  | "sim";

interface StatusMeta {
  variant: ChipVariant;
  /** Default human label when none is supplied by the caller. */
  label: string;
}

// Single source of truth: status string -> chip variant + default label.
// Status never relies on color alone — a text label always renders.
//
// The governance kinds (active/passed/failed/executed) default to the CANONICAL
// lifecycle vocabulary, not the raw on-chain enum words, so an un-overridden chip
// can never leak crypto-DAO words into a housing-first UI. Proposal/project
// rendering must STILL pass the override from proposalLifecycle.displayStatus()
// (or ProjectStatusChip) — these defaults are only a safe fallback.
const STATUS: Record<StatusKind, StatusMeta> = {
  active: { variant: "success", label: "Voting open" },
  verified: { variant: "success", label: "Verified" },
  passed: { variant: "success", label: "Approved" },
  completed: { variant: "success", label: "Completed" },
  executed: { variant: "success", label: "Funded" },
  claimed: { variant: "success", label: "Claimed" },

  ready: { variant: "accent", label: "Ready" },
  open: { variant: "accent", label: "Open" },

  pending: { variant: "warning", label: "Pending" },
  delayed: { variant: "warning", label: "Delayed" },

  blocked: { variant: "danger", label: "Blocked" },
  failed: { variant: "danger", label: "Rejected" },
  breached: { variant: "danger", label: "Breached" },
  impaired: { variant: "danger", label: "Impaired" },

  simulation: { variant: "sim", label: "Simulation" },
};

export interface StatusChipProps {
  status: StatusKind;
  /** Override the default label for this status. */
  label?: string;
  className?: string;
}

/**
 * Maps a known status string to a .chip-* variant and renders a text label
 * (never color alone). Unknown labels can be overridden via `label`.
 */
export function StatusChip({ status, label, className }: StatusChipProps) {
  const meta = STATUS[status];
  const text = label ?? meta.label;
  return (
    <span className={`chip chip-${meta.variant} ${className ?? ""}`}>{text}</span>
  );
}
