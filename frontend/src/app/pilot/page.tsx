import { coreProblem, outcomeMetrics, projectTypes, protocolFit } from "@/lib/research";

export default function PilotPage() {
  return (
    <div className="space-y-10">
      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <p className="marker-label">Use case</p>
        <h1 className="type-hero mt-5 max-w-3xl text-text-1">Capped-return capital for projects that almost work.</h1>
        <p className="type-body mt-5 max-w-3xl text-text-2">
          {coreProblem.short} Fair Squares fits projects with a real location, a clear affordability target and a funding gap that can be explained openly.
        </p>
        <a
          href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20gap"
          className="mt-7 inline-flex rounded-full bg-fs-magenta px-5 py-3 font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
        >
          Share a housing gap
        </a>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="marker-label">Project fit</p>
          <h2 className="type-section mt-4 text-text-1">The best candidates are concrete, local and outcome-based.</h2>
          <p className="type-body mt-4 text-text-2">
            Fair Squares should help where a focused capital layer can unlock affordable supply, not where the main risk is speculation or vague development upside.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {projectTypes.map((type) => (
            <div key={type} className="rounded-2xl border border-border bg-white p-4 font-bold text-text-1">
              {type}
            </div>
          ))}
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="type-section text-text-1">What the protocol can support</h2>
            <div className="mt-5 grid gap-3">
              {protocolFit.slice(0, 4).map((item) => (
                <div key={item} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/45 p-4 font-bold leading-7 text-text-1">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="type-section text-text-1">What should be reported</h2>
            <div className="mt-5 grid gap-3">
              {outcomeMetrics.slice(0, 4).map((metric) => (
                <div key={metric} className="rounded-2xl border border-border bg-white p-4 font-bold leading-7 text-text-1">
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
