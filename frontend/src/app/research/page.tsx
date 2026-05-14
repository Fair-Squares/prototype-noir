import { coreProblem, fairSquaresDirection, keyMetrics, researchSources } from "@/lib/research";

export default function ResearchPage() {
  return (
    <div className="space-y-12">
      <section className="open-card rounded-[2.5rem] p-6 md:p-10">
        <p className="marker-label">CPB research direction</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">
          The core problem is affordable supply, not housing marketing.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-text-2">
          {coreProblem.long}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {fairSquaresDirection.map((item) => (
          <div key={item.title} className="paper-lift rounded-[1.75rem] border border-fs-teal/20 bg-fs-mint/60 p-5">
            <h2 className="text-xl font-black text-text-1">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-text-2">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {researchSources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="paper-lift open-card group rounded-[2rem] p-5 hover:border-fs-teal/50"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-fs-magenta">
                {source.publisher} · {source.year}
              </p>
              <span className="text-xs font-semibold text-text-3 group-hover:text-fs-teal-dark">Source ↗</span>
            </div>
            <h2 className="mt-4 text-2xl font-black leading-tight text-text-1">{source.title}</h2>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl bg-bg p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-3">CPB / source signal</p>
                <p className="mt-2 text-sm leading-6 text-text-2">{source.takeaway}</p>
              </div>
              <div className="rounded-2xl bg-fs-mint p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-fs-teal-dark">Fair Squares fit</p>
                <p className="mt-2 text-sm leading-6 text-text-1">{source.implication}</p>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="marker-label">Public accountability</p>
          <h2 className="mt-3 text-4xl font-black">If the protocol helps, the housing outcome should be visible.</h2>
          <p className="mt-5 text-sm leading-7 text-text-2">
            Fair Squares should report the practical result of each project: the gap closed, homes enabled, rent level protected and affordability period maintained.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {keyMetrics.map((metric) => (
            <div key={metric} className="paper-lift rounded-[1.5rem] border border-border bg-white p-4 text-sm font-semibold leading-6 text-text-1">
              {metric}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
