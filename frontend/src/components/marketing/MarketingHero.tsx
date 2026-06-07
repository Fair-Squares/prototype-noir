import Link from "next/link";
import { ModelledChip } from "@/components/ui";

/**
 * Marketing hero — the mission-first landing lead, recreated from the website
 * kit's Hero.jsx + HeroArt on our design system (no Lucide, no inline-style
 * structure). Two columns: copy on the left, the mint hero-art square on the
 * right with two small floating cards.
 *
 * Honesty: the "~3%" stat is the REAL on-chain ROR (round(rorBps / 100)) and is
 * labelled "based on the on-chain ROR" — untagged. "40M+ Europeans priced out"
 * is a real-world societal figure, rendered plainly (not framed as an app
 * metric). The kit's unbacked "−20% lower rents" middle stat is dropped. The
 * floating-card sub-figures (shareholders, vote %) are illustrative and carry a
 * single shared ModelledChip caption under the art.
 *
 * The CTA targets are props so the same hero works on the disconnected home
 * (real routes — no in-page calculator anchor) and on /learn (in-page anchors).
 */
export function MarketingHero({
  rorBps = 300,
  ctaCalculatorHref = "#calculator",
  ctaLearnHref = "#how",
}: {
  rorBps?: number;
  ctaCalculatorHref?: string;
  ctaLearnHref?: string;
}) {
  const rorPct = Math.round((rorBps ?? 300) / 100);

  return (
    <section className="grid items-center gap-10 py-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:py-10">
      {/* LEFT — copy */}
      <div>
        <span className="chip chip-accent">Community-owned housing protocol</span>

        <h1 className="text-display mt-5 text-text-1">
          Housing, reimagined for
          <br />
          <span className="text-fs-teal">people, not profit.</span>
        </h1>

        <p className="text-body mt-5 max-w-md text-text-2">
          We pool capital from people who care to create affordable,
          community-focused homes — with a capped, transparent return for
          everyone who takes part.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={ctaCalculatorHref} className="btn btn-primary">
            Calculate the impact
          </Link>
          <Link href={ctaLearnHref} className="btn btn-secondary">
            Learn how
          </Link>
        </div>

        {/* Stat row */}
        <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-6">
          <Stat
            value={`~${rorPct}%`}
            label="Social return on rent"
            sub="based on the on-chain ROR"
          />
          <Stat
            value="40M+"
            label="Europeans priced out"
            sub="people across Europe spending too much on housing"
          />
        </dl>
      </div>

      {/* RIGHT — hero art */}
      <HeroArt />
    </section>
  );
}

function Stat({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <dd className="text-kpi text-text-1">{value}</dd>
      <dt className="text-caption mt-1.5 max-w-[12rem] text-text-2">{label}</dt>
      <p className="text-caption mt-0.5 max-w-[12rem] text-text-3">{sub}</p>
    </div>
  );
}

/** The mint square anchoring the hero: housing illustration + floating cards. */
function HeroArt() {
  return (
    <div className="flex flex-col gap-3">
      <div className="surface-mint relative flex aspect-square items-center justify-center overflow-hidden">
        <div
          className="dot-pattern pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/illustrations/housing-fund.png"
          alt=""
          aria-hidden="true"
          className="relative w-[58%] object-contain drop-shadow-[0_16px_30px_rgba(35,30,35,0.12)]"
        />

        {/* Floating cards — md+ only (collapse on mobile). */}
        <FloatCard
          className="left-5 top-6"
          tone="teal"
          label="Co-owned home"
          sub="12 shareholders"
        />
        <FloatCard
          className="bottom-6 right-5"
          tone="magenta"
          label="Member vote"
          sub="Passed · 87%"
        />
      </div>

      <p className="inline-flex flex-wrap items-center gap-2">
        <ModelledChip />
        <span className="text-caption text-text-3">
          Illustration figures are modelled for the demo
        </span>
      </p>
    </div>
  );
}

function FloatCard({
  className,
  tone,
  label,
  sub,
}: {
  className: string;
  tone: "teal" | "magenta";
  label: string;
  sub: string;
}) {
  const square = tone === "magenta" ? "bg-fs-magenta" : "bg-fs-teal";
  return (
    <div
      className={`surface absolute hidden items-center gap-3 whitespace-nowrap px-4 py-3 md:flex ${className}`}
    >
      <span
        className={`h-9 w-9 flex-none rounded-[10px] ${square}`}
        aria-hidden="true"
      />
      <span>
        <span className="block text-label normal-case tracking-normal text-text-1">
          {label}
        </span>
        <span className="text-caption mt-1 block text-text-3">{sub}</span>
      </span>
    </div>
  );
}
