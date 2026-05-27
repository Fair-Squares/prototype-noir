"use client";

import { PageHero } from "@/components/SimplePage";

const CORE_FLOW = [
  "Verified investors deposit cash into the housing fund.",
  "Governance proposes and votes on allocations.",
  "Executed proposals open distribution and fund share flows.",
  "Investors hold, trade, vote, and claim rewards.",
];

const CONCEPTS = [
  { term: "Cash (EURs)",       body: "Stable cash token used for deposits and settlement." },
  { term: "Fund Shares (FSFT)", body: "Tokenised share exposure to fund performance." },
  { term: "Rewards (FSP)",      body: "Protocol rewards split across deposit, share-holding, and governance participation." },
  { term: "Share Price",        body: "Fund Value divided by Fund Shares in circulation." },
  { term: "DEX boundaries",     body: "Buy and sell orders must sit inside protocol risk bands; full market depth lives in API views." },
  { term: "Governance metadata", body: "Proposal hashes, quorum traces, and execution metadata are kept out of voting screens; use API views for diagnostics." },
];

export default function ExplainPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="How it works"
        subtitle="Prototype mechanics in one page. For the public project's how-it-works guide, visit fair-squares.nl/how-it-works."
        ctaHref="https://fair-squares.nl/how-it-works"
        ctaLabel="fair-squares.nl/how-it-works"
      />

      <section className="surface p-5">
        <p className="text-tag mb-3 text-text-3">Section · core flow</p>
        <h2>Four steps</h2>
        <ol className="mt-4 space-y-2 text-text-2">
          {CORE_FLOW.map((step, i) => (
            <li key={step} className="grid grid-cols-[2rem_1fr] items-baseline gap-3">
              <span className="text-num text-fs-magenta">{String(i + 1).padStart(2, "0")}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="surface p-5">
        <p className="text-tag mb-3 text-text-3">Section · key concepts</p>
        <h2>Glossary</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {CONCEPTS.map(({ term, body }) => (
            <div key={term} className="border-l-2 border-fs-teal/40 pl-3">
              <dt className="font-semibold text-text-1">{term}</dt>
              <dd className="mt-1 text-text-2">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="surface p-5">
        <p className="text-tag mb-3 text-text-3">Section · external resources</p>
        <h2>Public project</h2>
        <p className="mt-2 text-text-2">
          For the full public-facing how-it-works guide, project mission, and pilot terms, open{" "}
          <a
            href="https://fair-squares.nl/how-it-works"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fs-teal-dark hover:text-fs-magenta"
          >
            fair-squares.nl/how-it-works
          </a>
          .
        </p>
      </section>
    </div>
  );
}
