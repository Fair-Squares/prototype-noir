/**
 * A labelled progress meter shared across the project detail tabs. Status is
 * always carried in adjacent text (never colour-alone) so it stays accessible.
 * Mirrors the `Meter` primitive used inside ProjectCard so the deal-room cards
 * and the memo read with one visual language.
 */
export function ProjectDetailMeter({
  fraction,
  tone,
}: {
  /** 0..1 share of the pool that has been claimed / filled. */
  fraction: number;
  tone: "accent" | "success";
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const pct = Math.round(clamped * 100);
  const color = tone === "success" ? "var(--color-success)" : "var(--color-accent)";
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      role="presentation"
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
