"use client";

import { PageHero } from "@/components/SimplePage";

export default function ExplainPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="How Fair Squares Works"
        subtitle="Detailed mechanics, formulas, and glossary."
        ctaHref="https://fair-squares.nl/how-it-works"
        ctaLabel="Visit Full Website Guide"
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-2">External Guide</h2>
        <p className="text-sm text-text-2">
          For the full public project walkthrough, open{" "}
          <a
            href="https://fair-squares.nl/how-it-works"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fs-teal hover:underline"
          >
            fair-squares.nl/how-it-works
          </a>
          .
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-3">Core Flow</h2>
        <ol className="space-y-2 text-sm text-text-2">
          <li>1. Verified users deposit cash into the housing fund.</li>
          <li>2. Governance proposes and votes on allocations.</li>
          <li>3. Executed proposals open distribution and fund share flows.</li>
          <li>4. Users can hold, trade, vote, and claim rewards.</li>
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold mb-3">Fund Pricing Formula</h2>
          <p className="text-sm text-text-2">
            Estimated Fund Share price is calculated as:
          </p>
          <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-sm font-semibold">
            Fund Value / Fund Shares In Circulation
          </div>
          <p className="text-xs text-text-3 mt-3">
            Main pages show only the final value. This page is the reference source for formula details.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold mb-3">Rewards Allocation</h2>
          <p className="text-sm text-text-2">
            Epoch rewards are split into three buckets:
          </p>
          <ul className="mt-3 space-y-1 text-sm text-text-2">
            <li>- Deposit participation</li>
            <li>- Fund Share holder participation</li>
            <li>- Governance participation</li>
          </ul>
          <p className="text-xs text-text-3 mt-3">
            Account pages focus on your eligibility and claimable amount. Full mechanics stay here.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-3">DEX Notes</h2>
        <p className="text-sm text-text-2">
          Trading accepts buy and sell orders within protocol risk boundaries. Main trade page focuses on placing and
          managing your orders. Orderbook depth and detailed market interpretation should be treated as advanced
          reference material.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-3">Governance Metadata</h2>
        <p className="text-sm text-text-2">
          Proposal description hashes, quorum traces, and low-level execution metadata are intentionally removed from
          main voting screens. Use API views and developer tools when you need deep governance diagnostics.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-3">Glossary</h2>
        <div className="grid gap-2 text-sm text-text-2 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="font-semibold">Cash (EURs)</p>
            <p className="text-xs text-text-3 mt-1">Stable cash token used for deposits and settlement.</p>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="font-semibold">Fund Shares (FSFT)</p>
            <p className="text-xs text-text-3 mt-1">Tokenized share exposure to fund performance.</p>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="font-semibold">Rewards (FSP)</p>
            <p className="text-xs text-text-3 mt-1">Protocol rewards distributed by participation rules.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
