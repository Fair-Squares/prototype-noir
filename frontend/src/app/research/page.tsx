import { coreProblem, outcomeMetrics, overview, protocolFit } from "@/lib/research";

export default function ResearchPage() {
  return (
    <div className="space-y-10">
      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <p className="marker-label">Approach</p>
        <h1 className="type-hero mt-5 max-w-3xl text-text-1">A practical answer to the affordable housing gap.</h1>
        <p className="type-body mt-5 max-w-3xl text-text-2">{coreProblem.long}</p>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-3">
          {overview.map((item) => (
            <div key={item.title}>
              <h2 className="type-section text-text-1">{item.title}</h2>
              <p className="type-body mt-3 text-text-2">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="marker-label">Protocol fit</p>
          <h2 className="type-section mt-4 text-text-1">The technology is useful when it makes trust easier.</h2>
          <p className="type-body mt-4 text-text-2">
            The public story should stay simple: what is being funded, why the gap exists, who can participate and how the affordability promise is monitored.
          </p>
        </div>
        <div className="grid gap-3">
          {protocolFit.map((item) => (
            <div key={item} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/50 p-4 font-bold leading-7 text-text-1">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-fs-teal/20 bg-fs-anthracite p-6 text-white md:p-8">
        <h2 className="type-section">Report outcomes in plain language.</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outcomeMetrics.map((metric) => (
            <div key={metric} className="rounded-2xl border border-white/10 bg-white/7 p-4 font-bold leading-7">
              {metric}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
