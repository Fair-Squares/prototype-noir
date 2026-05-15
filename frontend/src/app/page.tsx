import Link from "next/link";
import { cpbEdges, financingStack, outcomeMetrics, projectTypes, thesis } from "@/lib/research";

export default function HomePage() {
  return (
    <div className="space-y-14 overflow-hidden">
      <section className="hero-ledger relative rounded-[2.4rem] border border-fs-anthracite/10 px-6 py-10 shadow-2xl shadow-fs-anthracite/10 md:px-10 md:py-14">
        <div className="absolute right-5 top-5 hidden rounded-full border border-fs-teal/35 bg-white/60 px-4 py-2 text-sm font-extrabold text-fs-teal-dark backdrop-blur md:block">
          CPB-backed · pilot-first · fair financing
        </div>

        <div className="relative grid gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="marker-label mb-6">Fair Squares / financing layer</p>
            <h1 className="type-hero text-text-1">Finance the gap that keeps affordable homes from being built.</h1>
            <p className="type-lead mt-6 max-w-2xl text-text-2">{thesis.oneLiner}</p>
            <p className="type-body mt-5 max-w-2xl text-text-2">{thesis.mission}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20pilot%20project"
                className="inline-flex items-center justify-center rounded-full bg-fs-magenta px-5 py-3 font-black text-white shadow-lg shadow-fs-magenta/25 hover:-translate-y-0.5 hover:bg-fs-anthracite"
              >
                Bring a pilot project
              </a>
              <Link
                href="/pilot"
                className="inline-flex items-center justify-center rounded-full border border-fs-anthracite/15 bg-white/80 px-5 py-3 font-black text-text-1 hover:-translate-y-0.5 hover:border-fs-teal/50 hover:bg-fs-mint"
              >
                View pilot terms
              </Link>
            </div>
          </div>

          <div className="finance-slip">
            <div className="flex items-center justify-between border-b border-fs-anthracite/10 pb-4">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-fs-magenta">Project gap memo</p>
              <p className="rounded-full bg-fs-mint px-3 py-1 text-sm font-black text-fs-teal-dark">not a subsidy pool</p>
            </div>
            <div className="mt-5 space-y-4">
              {financingStack.map((item) => (
                <div key={item.title} className="grid grid-cols-[3.2rem_1fr] gap-4 rounded-2xl border border-fs-anthracite/10 bg-white/72 p-4">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-fs-anthracite font-black text-white">{item.label}</span>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-text-1">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-text-2">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <div className="sticky-note">
          <p className="marker-label">The edge</p>
          <h2 className="type-section mt-5 text-text-1">Stay sharp: use CPB to define where Fair Squares is useful — and where it is not.</h2>
          <p className="type-body mt-4 text-text-2">
            The old site speaks broadly about community ownership. The prototype should be narrower and more credible: documented financing gaps, capped returns and protected affordability.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {cpbEdges.map((item) => (
            <article key={item.claim} className="edge-card paper-lift rounded-[1.6rem] border border-fs-teal/20 bg-white/86 p-5">
              <h3 className="text-xl font-black leading-tight tracking-tight text-text-1">{item.claim}</h3>
              <p className="mt-4 text-sm font-semibold leading-6 text-text-2">{item.implication}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="marker-label">Best first use</p>
            <h2 className="type-section mt-5 text-text-1">Projects where affordability is clear but the final capital layer is missing.</h2>
            <p className="type-body mt-4 text-text-2">
              Fair Squares should not look like a generic real-estate fund. It should look like a financing tool for concrete local projects that are close to working.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projectTypes.map((type) => (
              <div key={type} className="rounded-2xl border border-border bg-fs-mint/45 p-4 font-black text-text-1">
                {type}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="impact-band rounded-[2rem] border border-fs-teal/20 p-6 text-white shadow-2xl shadow-black/10 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="type-body font-black text-fs-teal-light">Proof over promises</p>
            <h2 className="type-section mt-4">A fair-financing product should report housing outcomes, not just protocol activity.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {outcomeMetrics.map((metric) => (
              <div key={metric} className="rounded-2xl border border-white/10 bg-white/8 p-4 font-black leading-7">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
