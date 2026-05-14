import Link from "next/link";
import { coreProblem, outcomeMetrics, overview, projectTypes, protocolFit } from "@/lib/research";

export default function HomePage() {
  return (
    <div className="space-y-12 overflow-hidden">
      <section className="open-card relative rounded-[2rem] px-6 py-9 md:px-10 md:py-12">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-fs-teal/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-fs-magenta/10 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="marker-label mb-5">Fair Squares</p>
            <h1 className="type-hero text-text-1">Affordable housing needs a better capital layer.</h1>
            <p className="type-body mt-5 max-w-2xl text-text-2">{coreProblem.long}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20project"
                className="inline-flex items-center justify-center rounded-full bg-fs-magenta px-5 py-3 font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
              >
                Discuss a project
              </a>
              <Link
                href="/research"
                className="inline-flex items-center justify-center rounded-full border border-fs-teal/35 bg-fs-mint px-5 py-3 font-bold text-fs-teal-dark hover:-translate-y-0.5 hover:bg-white"
              >
                See the approach
              </Link>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-fs-teal/25 bg-white p-5 shadow-xl shadow-fs-anthracite/8">
            <p className="type-body font-bold text-fs-magenta">Simple overview</p>
            <div className="mt-4 divide-y divide-border">
              {overview.map((item) => (
                <div key={item.title} className="py-4 first:pt-0 last:pb-0">
                  <h2 className="type-section text-text-1">{item.title}</h2>
                  <p className="type-body mt-2 text-text-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="marker-label">What Fair Squares does</p>
            <h2 className="type-section mt-4 text-text-1">Turn a housing finance gap into something people can fund, govern and verify.</h2>
            <p className="type-body mt-4 text-text-2">
              Fair Squares already has the useful pieces: funding pools, project accounting, governance, participant checks and capped-return logic. The public site should explain that clearly instead of looking like a research archive.
            </p>
          </div>
          <div className="grid gap-3">
            {protocolFit.map((item) => (
              <div key={item} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/45 p-4 font-bold leading-7 text-text-1">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="marker-label">Best fit</p>
          <h2 className="type-section mt-4 text-text-1">Projects where affordability is clear but the last capital layer is missing.</h2>
          <p className="type-body mt-4 text-text-2">
            Fair Squares is strongest when the project is concrete, the social value is visible and the funding gap can be explained without a spreadsheet full of assumptions.
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

      <section className="rounded-[2rem] border border-fs-teal/20 bg-fs-anthracite p-6 text-white shadow-2xl shadow-black/10 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="type-body font-bold text-fs-teal-light">What should be visible</p>
            <h2 className="type-section mt-4">A public housing product should prove the housing result.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {outcomeMetrics.map((metric) => (
              <div key={metric} className="rounded-2xl border border-white/10 bg-white/7 p-4 font-bold leading-7">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
