import { ModelledChip } from "@/components/ui";

/**
 * Marketing — the affordability crisis band (recreates the website kit's
 * `Problem()` section on our design system).
 *
 * Two-column layout: LEFT a teal eyebrow + Nexa headline + lead; RIGHT a white
 * `.surface` card with a horizontal bar chart of housing-cost burden by country.
 *
 * HONESTY (CLAUDE.md honesty rule): every bar figure here is illustrative — the
 * "40 million Europeans" headline is a real-world *societal* figure (rendered
 * plainly, not framed as an app metric), and the chart's six bars are modelled,
 * so the card footer carries a single `<ModelledChip/>`. No on-chain value is
 * shown, so nothing is mislabelled as live.
 *
 * `band` (default false): when true the section paints a full-bleed `.band-mint`
 * band (used on the full-width /learn marketing page); when false it renders as a
 * calm in-column `.surface-mint` card (used on the disconnected home, which stays
 * inside main's max-w-6xl column).
 */
export function AffordabilityProblem({ band = false }: { band?: boolean }) {
  // Illustrative housing-cost burden (% of income spent on housing). All six
  // figures are modelled for the demo — see the card footer ModelledChip.
  const bars: ReadonlyArray<readonly [string, number]> = [
    ["Greece", 92],
    ["Netherlands", 71],
    ["Germany", 64],
    ["Spain", 58],
    ["France", 49],
    ["EU avg", 41],
  ];

  const content = (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
      {/* LEFT — the story */}
      <div>
        <span className="text-label">The affordability crisis</span>
        <h2 className="text-display mt-4 text-text-1">
          Nearly 40 million Europeans spend too much just to keep a roof
          overhead.
        </h2>
        <p className="text-body mt-5 max-w-md text-text-2">
          Today&apos;s housing markets put profit over people. Fair Squares is
          proving a different way is possible — one that&apos;s fair,
          transparent, and built to last.
        </p>
      </div>

      {/* RIGHT — the bar chart card */}
      <div className="surface p-7">
        <div className="text-label">% of income spent on housing</div>
        <div className="mt-5 flex flex-col gap-4">
          {bars.map(([name, value]) => (
            <div key={name} className="flex items-center gap-3.5">
              <div className="w-24 shrink-0 text-caption text-text-2">
                {name}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full rounded-full ${
                    value > 65 ? "bg-fs-magenta" : "bg-fs-teal"
                  }`}
                  /* width is the only inline value — same pattern as our other
                     progress bars; the % drives the fill length. */
                  style={{ width: `${value}%` }}
                />
              </div>
              <div className="w-9 shrink-0 text-right text-caption text-text-1 text-mono">
                {value}%
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <ModelledChip label="Modelled for demo" />
          <span className="text-caption text-text-3">
            Illustrative housing-cost burden by country
          </span>
        </div>
      </div>
    </div>
  );

  if (band) {
    // Full-bleed mint band for the wide /learn marketing page. The page breaks
    // main's column padding with negative margins; here we just paint the band
    // and re-establish the centred content column.
    return (
      <section id="problem" className="band-mint py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">{content}</div>
      </section>
    );
  }

  // In-column calm variant for the disconnected home — a mint card, not a band.
  return (
    <section id="problem" className="surface-mint p-7 sm:p-9">
      {content}
    </section>
  );
}
