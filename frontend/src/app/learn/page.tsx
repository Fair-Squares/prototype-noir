"use client";

import { useEffect, useState } from "react";
import { fetchFundStats } from "@/lib/contracts";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { AffordabilityProblem } from "@/components/marketing/AffordabilityProblem";
import { ImpactCalculator } from "@/components/marketing/ImpactCalculator";
import { HowItWorksExplainer } from "@/components/about/HowItWorksExplainer";
import { AdvancedDetails } from "@/components/ui";
import { ParametersPanel } from "@/components/about/ParametersPanel";

/**
 * /learn — the public "About Fair Squares" marketing site.
 *
 * This is the FULL marketing experience (the disconnected home shows an
 * in-column subset). Order mirrors the website kit: hero → problem → how it
 * works → impact calculator → closing CTA. No PageHeader — marketing leads
 * with the hero.
 *
 * Full-bleed vs in-column: the page itself sits inside main's max-w-6xl column
 * (px-4 lg:px-8). The affordability section renders with `band` so it paints a
 * full-width `.band-mint`; we break main's column padding with `-mx-4 lg:-mx-8`
 * so that mint band runs edge-to-edge (the band re-establishes its own centred
 * content column internally). The hero, how-it-works, calculator, and the CTA's
 * rounded dark panel stay in the calm column.
 *
 * Honesty: the hero's "~3%" and the calculator's annual return are the REAL
 * on-chain ROR (HousingFund.ror_bps via /api/fund/stats); everything modelled
 * carries a <ModelledChip/> inside its component. The page only sources rorBps
 * here — no other app data is read or invented. No useSearchParams, so no
 * Suspense boundary is required.
 */
export default function LearnPage() {
  // Real ROR for the hero stat. The calculator self-fetches independently, so a
  // failed read here just leaves the hero on its 300 bps default rather than
  // masking the value (CLAUDE.md error-handling rule — no fallback that lies).
  const [rorBps, setRorBps] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchFundStats()
      .then((stats) => {
        if (!cancelled && typeof stats.rorBps === "number") setRorBps(stats.rorBps);
      })
      .catch(() => {
        /* keep undefined → hero falls back to its documented 300 bps default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-16">
      <MarketingHero
        rorBps={rorBps}
        ctaCalculatorHref="#calculator"
        ctaLearnHref="#how"
      />

      {/* Full-bleed mint band — break main's px-4 lg:px-8 column padding. The
          `band` variant re-establishes its own centred max-w-6xl content. */}
      <div className="-mx-4 lg:-mx-8">
        <AffordabilityProblem band />
      </div>

      <section id="calculator" className="scroll-mt-24">
        <ImpactCalculator initialRorBps={rorBps} />
      </section>

      {/* S4: one About door — mission above, the protocol explainer and the
          parameters/transparency panel below (moved from the retired /explain
          and /reference routes, which now redirect here). The marketing
          HowItWorks cards and closing CTA were cut: the explainer below covers
          the same ground with the real mechanics, and the page needs no second
          call to action. */}
      <section id="how-it-works" className="scroll-mt-24">
        <h2 className="text-title mb-4 text-text-1">How the protocol works</h2>
        <HowItWorksExplainer />
      </section>

      <section id="parameters" className="scroll-mt-24">
        <h2 className="text-title mb-4 text-text-1">Parameters &amp; transparency</h2>
        {/* The one sanctioned dense technical surface (the old /reference,
            folded here). Protocol-internal vocabulary is allowed inside, but
            it stays opt-in behind disclosure — not in the primary flow. */}
        <AdvancedDetails summary="Protocol parameters, addresses and formulas (technical)">
          <ParametersPanel />
        </AdvancedDetails>
      </section>
    </div>
  );
}
