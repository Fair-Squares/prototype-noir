import Link from "next/link";

export interface MarketingCTAProps {
  /** Primary CTA destination — a real app route. Default: /invest. */
  primaryHref?: string;
  /** Primary CTA label. Default: "Get started". */
  primaryLabel?: string;
  /** Secondary CTA destination — a real app route. Default: /explain. */
  secondaryHref?: string;
  /** Secondary CTA label. Default: "How it works". */
  secondaryLabel?: string;
}

/**
 * Closing marketing CTA — a full-width dark anthracite panel (.panel-dark) with
 * a subtle radial teal-dot texture overlay (.dot-pattern), recreating the kit's
 * CTASection on our design system. A teal eyebrow, a white Nexa headline, a
 * mint-on-dark lead, then the single per-view magenta highlight button (the
 * primary action) beside a ghost-on-dark secondary.
 *
 * Honesty: both CTAs point to REAL app routes (Link) — no "Read the paper" dead
 * link. There are no numbers here, so nothing to label. The single magenta
 * highlight (.btn-highlight) is the only magenta CTA on the page; callers must
 * not introduce a second one.
 */
export function MarketingCTA({
  primaryHref = "/portfolio#deposit",
  primaryLabel = "Get started",
  secondaryHref = "/learn#how-it-works",
  secondaryLabel = "How it works",
}: MarketingCTAProps) {
  return (
    <section aria-labelledby="marketing-cta-heading">
      <div className="panel-dark relative overflow-hidden px-7 py-14 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        {/* Kit's radial teal-dot texture — overlay div, not inline. */}
        <div className="dot-pattern pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />

        <div className="relative max-w-2xl">
          <span className="text-label text-fs-teal">Join the community</span>

          <h2
            id="marketing-cta-heading"
            className="text-display mt-4 text-white sm:text-4xl lg:text-5xl"
          >
            A fairer housing future, built by everyone.
          </h2>

          <p className="text-body mt-5 text-fs-mint">
            Join families and investors creating housing that&rsquo;s fair,
            transparent, and owned by the community.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {/* The single per-view magenta highlight. */}
            <Link href={primaryHref} className="btn btn-highlight">
              {primaryLabel}
            </Link>
            <Link href={secondaryHref} className="btn btn-ghost-dark">
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
