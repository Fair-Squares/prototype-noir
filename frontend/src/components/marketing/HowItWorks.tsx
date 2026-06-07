/**
 * How it works — the 3-step "transparent path from capital to community" band.
 *
 * Recreates the website kit's HowItWorks section on our design system: a centred
 * teal eyebrow + Nexa display headline, then three `.surface` cards each carrying
 * a big ghosted step number (01/02/03) and a mint square tile.
 *
 * Icon-light by rule — the kit leaned on Lucide icons inside each card; we drop
 * the icon library entirely and use a brand-colour mint square block + the
 * numbered "01/02/03" rhythm instead. All copy here is qualitative (no numbers),
 * so no honesty chips are needed.
 *
 * "Cap the return" copy is mapped to OUR canonical ROR model: rent is fixed off
 * the property's acquisition value up front (rent = ROR × acquisition value),
 * capped, and flows fully to investors — keeping tenant rents affordable by
 * construction. See "Economic model: rent, return & NAV" in CLAUDE.md.
 */

const STEPS: ReadonlyArray<readonly [string, string]> = [
  [
    "Pool capital",
    "People who care pool funds to crowd-invest in a real home — no single owner, no gatekeeper.",
  ],
  [
    "Cap the return",
    "The protocol fixes a return on rent up front, so rents stay affordable and fair for tenants.",
  ],
  [
    "Govern together",
    "A community DAO gives every member a real say. Decisions are transparent and recorded on-chain.",
  ],
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-it-works-heading" className="py-4">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-label">How it works</p>
        <h2
          id="how-it-works-heading"
          className="text-display text-text-1 mt-4"
        >
          A transparent path from capital to community.
        </h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="surface flex flex-col p-7">
            <div className="flex items-start justify-between">
              {/* Mint square tile — brand colour block, deliberately icon-free. */}
              <div
                className="bg-fs-mint h-[52px] w-[52px] rounded-[14px]"
                aria-hidden="true"
              />
              <span className="text-display text-ink-200 leading-none">
                {`0${i + 1}`}
              </span>
            </div>
            <h3 className="text-text-1 mt-6 text-lg font-bold">{title}</h3>
            <p className="text-body text-text-2 mt-3">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;
