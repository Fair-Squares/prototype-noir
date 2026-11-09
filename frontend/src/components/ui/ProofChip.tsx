export type ProofState = "ok" | "pending" | "blocked" | "off";

interface ProofMeta {
  variant: "success" | "warning" | "danger" | "neutral";
  /** Screen-reader status word, paired with the visible label. */
  status: string;
}

const PROOF: Record<ProofState, ProofMeta> = {
  ok: { variant: "success", status: "verified" },
  pending: { variant: "warning", status: "pending" },
  blocked: { variant: "danger", status: "blocked" },
  off: { variant: "neutral", status: "not active" },
};

export interface ProofChipProps {
  /** Visible label describing the proof / check. */
  label: string;
  state: ProofState;
  className?: string;
}

/**
 * Small chip for the trust rail. State maps to a status color
 * (ok=success, pending=warning, blocked=danger, off=neutral). The state word is
 * exposed to assistive tech via aria-label so meaning never relies on color.
 */
export function ProofChip({ label, state, className }: ProofChipProps) {
  const meta = PROOF[state];
  return (
    <span
      className={`chip chip-${meta.variant} ${className ?? ""}`}
      aria-label={`${label}: ${meta.status}`}
    >
      {label}
    </span>
  );
}
