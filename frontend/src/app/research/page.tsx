import { coreProblem, cpbEdges, overview, protocolFit } from "@/lib/research";

export default function ResearchPage() {
  return (
    <div className="space-y-12">
      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <p className="marker-label">Research translated into product discipline</p>
        <h1 className="type-hero mt-5 max-w-4xl text-text-1">The CPB case for targeted gap capital.</h1>
        <p className="type-lead mt-5 max-w-3xl text-text-2">{coreProblem.long}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {overview.map((item) => (
          <article key={item.title} className="open-card rounded-[1.6rem] p-5">
            <h2 className="type-section text-text-1">{item.title}</h2>
            <p className="type-body mt-3 text-text-2">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-fs-anthracite/10 bg-white/70 p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="marker-label">CPB-defined boundaries</p>
            <h2 className="type-section mt-5 text-text-1">The point is not “housing is broken”. The point is where Fair Squares can intervene.</h2>
            <p className="type-body mt-4 text-text-2">
              CPB’s work keeps the story honest: land scarcity, permits and broad subsidies are real constraints. Fair Squares should only claim the wedge it can actually test — a documented financing gap in a concrete affordable project.
            </p>
          </div>
          <div className="space-y-3">
            {cpbEdges.map((item, index) => (
              <article key={item.claim} className="grid gap-3 rounded-2xl border border-fs-teal/20 bg-fs-mint/40 p-4 md:grid-cols-[3rem_1fr]">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-fs-teal-dark font-black text-white">{index + 1}</span>
                <div>
                  <h3 className="font-black leading-6 text-text-1">{item.claim}</h3>
                  <p className="mt-1 text-sm font-semibold leading-6 text-text-2">{item.implication}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="marker-label">Technology posture</p>
          <h2 className="type-section mt-4 text-text-1">The protocol is strongest when it reduces trust friction.</h2>
          <p className="type-body mt-4 text-text-2">
            Keep tokenisation and privacy rails behind the finance mission. The public story should explain what is funded, why the gap exists, who governs it and how affordability is checked.
          </p>
        </div>
        <div className="grid gap-3">
          {protocolFit.map((item) => (
            <div key={item} className="rounded-2xl border border-fs-teal/20 bg-white p-4 font-black leading-7 text-text-1 shadow-sm">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
