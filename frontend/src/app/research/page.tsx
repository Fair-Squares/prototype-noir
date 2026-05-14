import { keyMetrics, productionPath, researchSources } from "@/lib/research";

export default function ResearchPage() {
  return (
    <div className="space-y-12">
      <section className="rounded-[2rem] border border-border bg-card p-6 md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-dark">Research base</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">
          A production path grounded in housing-market evidence.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-text-2">
          This page translates the Dutch housing research into plain English. The basic point is simple: some affordable housing projects are good for society, but the numbers do not work when rents are capped and ordinary capital still expects market-level returns.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {researchSources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="group rounded-3xl border border-border bg-card p-5 hover:border-fs-teal/50 hover:shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-fs-magenta">
                {source.publisher} · {source.year}
              </p>
              <span className="text-xs font-semibold text-text-3 group-hover:text-fs-teal-dark">Source ↗</span>
            </div>
            <h2 className="mt-4 text-2xl font-black leading-tight">{source.title}</h2>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl bg-bg p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-3">Evidence</p>
                <p className="mt-2 text-sm leading-6 text-text-2">{source.takeaway}</p>
              </div>
              <div className="rounded-2xl bg-fs-mint/60 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-fs-teal-dark">What this means for Fair Squares</p>
                <p className="mt-2 text-sm leading-6 text-text-1">{source.implication}</p>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section className="rounded-[2rem] border border-text-1/10 bg-text-1 p-6 text-white md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">Production path</p>
        <h2 className="mt-3 text-4xl font-black">From thesis to pilot, before protocol scale.</h2>
        <div className="mt-8 grid gap-3">
          {productionPath.map((item) => (
            <div key={item.phase} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[72px_1fr_160px] md:items-start">
              <p className="text-3xl font-black text-fs-teal-light">{item.phase}</p>
              <div>
                <h3 className="text-xl font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{item.body}</p>
              </div>
              <p className="rounded-full border border-white/10 px-3 py-1 text-center text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                {item.status}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-magenta">Pilot KPIs</p>
          <h2 className="mt-3 text-4xl font-black">Measure homes, not hype.</h2>
          <p className="mt-5 text-sm leading-7 text-text-2">
            A serious pilot should be judged by concrete housing outcomes: homes enabled, rent discounts, affordability duration and clean reporting.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {keyMetrics.map((metric) => (
            <div key={metric} className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold leading-6 text-text-1">
              {metric}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
