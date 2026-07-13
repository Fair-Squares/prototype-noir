import type { HomeStage } from "./homeRows";

/**
 * S1: the shared lifecycle strip every home card carries, so a home tells one
 * story wherever it appears. Four milestones; rejected stages show where the
 * journey stopped. Pure presentation — the stage is derived in homeRows.ts.
 */
const MILESTONES = ["Council review", "Community vote", "Funding", "Owned"] as const;

/** Index of the milestone a stage has reached (-1 = none completed yet). */
const REACHED: Record<HomeStage, number> = {
  review: 0,
  ready: 0,
  rejected_review: 0,
  voting: 1,
  voting_ended: 1,
  rejected_vote: 1,
  queued: 2,
  owned: 3,
};

const REJECTED_AT: Partial<Record<HomeStage, number>> = {
  rejected_review: 0,
  rejected_vote: 1,
};

export function HomeLifecycle({ stage }: { stage: HomeStage }) {
  const reached = REACHED[stage];
  const rejectedAt = REJECTED_AT[stage];

  return (
    <ol
      aria-label="Home lifecycle"
      className="flex items-center gap-1.5 text-[11px] leading-none text-text-3"
    >
      {MILESTONES.map((label, i) => {
        const isRejectedHere = rejectedAt === i;
        const isDone = rejectedAt === undefined && i < reached;
        const isCurrent = rejectedAt === undefined && i === reached;
        const dotClass = isRejectedHere
          ? "bg-[var(--color-danger)]"
          : isDone
            ? "bg-[var(--color-success)]"
            : isCurrent
              ? "bg-[var(--color-accent)]"
              : "bg-border-strong";
        const textClass = isRejectedHere
          ? "text-[var(--color-danger)]"
          : isCurrent
            ? "text-text-1 font-medium"
            : isDone
              ? "text-text-2"
              : "text-text-3";
        // After a rejection the remaining milestones never happen — skip them.
        if (rejectedAt !== undefined && i > rejectedAt) return null;
        return (
          <li key={label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <span aria-hidden="true" className="h-px w-3 bg-border" /> : null}
            <span aria-hidden="true" className={`h-1.5 w-1.5 flex-none rounded-full ${dotClass}`} />
            <span className={`truncate ${textClass}`}>
              {isRejectedHere ? `Stopped at ${label.toLowerCase()}` : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
