import { coreProblem, outcomeMetrics, pilotTerms, projectTypes, protocolFit } from "@/lib/research";

export default function PilotPage() {
  return (
    <div className="space-y-12">
      <section className="hero-ledger rounded-[2.4rem] border border-fs-anthracite/10 px-6 py-10 shadow-2xl shadow-fs-anthracite/10 md:px-10 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.92fr] lg:items-center">
          <div>
            <p className="marker-label">First pilot product</p>
            <h1 className="type-hero mt-5 max-w-4xl text-text-1">Viability-gap finance for affordable rental projects.</h1>
            <p className="type-lead mt-5 max-w-3xl text-text-2">
              {coreProblem.short} Fair Squares is the capped-return layer that can make the project work without pushing rents back up.
            </p>
            <a
              href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20gap"
              className="mt-8 inline-flex rounded-full bg-fs-magenta px-5 py-3 font-black text-white shadow-lg shadow-fs-magenta/25 hover:-translate-y-0.5 hover:bg-fs-anthracite"
            >
              Share a blocked project
            </a>
          </div>
          <div className="finance-slip">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-fs-magenta">Draft pilot terms</p>
            <dl className="mt-5 divide-y divide-fs-anthracite/10">
              {pilotTerms.map(([term, value]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[8.5rem_1fr]">
                  <dt className="text-sm font-black text-text-1">{term}</dt>
                  <dd className="text-sm font-semibold leading-6 text-text-2">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="marker-label">Project filter</p>
          <h2 className="type-section mt-4 text-text-1">Only fund projects where the gap is real and the public benefit can be locked.</h2>
          <p className="type-body mt-4 text-text-2">
            The best candidates are concrete, local and outcome-based. They have a partner, a location, reduced planning risk and an affordability commitment worth protecting.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {projectTypes.map((type) => (
            <div key={type} className="rounded-2xl border border-border bg-white p-4 font-black text-text-1 shadow-sm">
              {type}
            </div>
          ))}
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="type-section text-text-1">Protocol support</h2>
            <div className="mt-5 grid gap-3">
              {protocolFit.slice(0, 4).map((item) => (
                <div key={item} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/45 p-4 font-black leading-7 text-text-1">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="type-section text-text-1">Pilot reporting</h2>
            <div className="mt-5 grid gap-3">
              {outcomeMetrics.slice(0, 4).map((metric) => (
                <div key={metric} className="rounded-2xl border border-border bg-white p-4 font-black leading-7 text-text-1">
                  {metric}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
