import { InfoDot } from "@/components/ui";

/**
 * An explicit, honest note that the "human" property facts an investor might
 * expect in a memo — location, unit counts, the affordability covenant, the
 * capped-return terms, valuation reports — are NOT recorded on-chain by this
 * protocol, so they are omitted rather than invented. Real data only.
 *
 * Rendered as a plain surface block (not a coloured Alert) because this is a
 * calm, neutral disclosure, not a success or error state.
 */
export function ProjectDetailNotOnChain() {
  return (
    <div className="surface border-dashed p-5">
      <h2 className="text-heading inline-flex items-center gap-1 text-text-1">
        Not recorded on-chain
        <InfoDot
          label="Why are these fields missing"
          content="Fair Squares only commits to chain the figures it can prove: the capital ask, the vote tally, the distribution pool, and the property deed. Everything else lives off-chain and is intentionally left out here so nothing is fabricated."
        />
      </h2>
      <p className="text-caption mt-1 max-w-prose text-text-2">
        Location, unit counts, the affordability covenant, capped-return terms
        and valuation reports are not part of any on-chain record for this
        project. Where a project has a financing dossier on file, those off-chain
        facts appear in the <span className="font-semibold">Dossier</span> tab,
        each clearly tagged <span className="italic">&ldquo;Modelled for
        demo&rdquo;</span> — never mixed into the on-chain figures above. In
        particular the capped return is a documented covenant policy, not yet
        enforced in the circuit, so it does not reduce the on-chain distribution
        each holder claims.
      </p>
    </div>
  );
}
