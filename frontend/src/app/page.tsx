import Link from "next/link";
import { fairSquaresDirection, researchSources } from "@/lib/research";

const fitPoints = [
  ["The gap", "Affordable rents lower project income, which can make good housing plans fail on financing."],
  ["The Fair Squares role", "Bring in capped-return capital that accepts lower upside in exchange for measurable public value."],
  ["The public outcome", "More affordable homes, longer affordability periods and reporting that people can actually read."],
];

const projectTypes = [
  "Mid-rent rental projects",
  "Building transformations",
  "Rooftop additions",
  "Splits of existing buildings",
  "Social housing corporation pipeline gaps",
  "Municipality-backed affordability projects",
];

export default function HomePage() {
  return (
    <div className="space-y-14 overflow-hidden">
      <section className="relative rounded-[2.25rem] border border-fs-teal/20 bg-white/80 px-6 py-10 shadow-2xl shadow-fs-anthracite/10 md:px-12 md:py-16 lg:px-14">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fs-teal/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 h-72 w-72 rounded-full bg-fs-magenta/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-4xl">
            <p className="marker-label mb-5">Fair Squares · Affordable housing capital</p>
            <h1 className="max-w-5xl text-5xl font-black text-text-1 md:text-7xl lg:text-8xl">
              Helping affordable homes get financed without pushing rents up.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-2 md:text-xl">
              CPB research shows the tension clearly: rent caps improve affordability, but they can also make projects harder to finance. Fair Squares is built for that middle space — patient capital for specific housing gaps with clear affordability outcomes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20project"
                className="inline-flex items-center justify-center rounded-full bg-fs-magenta px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
              >
                Discuss a housing project
              </a>
              <Link
                href="/research"
                className="inline-flex items-center justify-center rounded-full border border-fs-teal/35 bg-fs-mint px-6 py-3 text-sm font-bold text-fs-teal-dark hover:-translate-y-0.5 hover:bg-white"
              >
                See the research direction
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-fs-teal/20 bg-fs-mint/70 p-4 shadow-xl shadow-fs-anthracite/10">
            <div className="rounded-[1.6rem] bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-fs-magenta">Where Fair Squares fits</p>
              <h2 className="mt-4 text-3xl font-black text-text-1 md:text-4xl">A capital layer for the part traditional finance struggles to serve.</h2>
              <div className="mt-6 grid gap-3">
                {fitPoints.map(([label, body]) => (
                  <div key={label} className="rounded-2xl border border-border bg-bg p-4">
                    <p className="text-sm font-black text-fs-teal-dark">{label}</p>
                    <p className="mt-2 text-sm leading-6 text-text-2">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        {fairSquaresDirection.map((card, index) => (
          <div key={card.title} className="paper-lift open-card rounded-[2rem] p-6">
            <p className="mb-5 text-sm font-black text-fs-magenta">0{index + 1}</p>
            <h3 className="text-2xl font-black text-text-1">{card.title}</h3>
            <p className="mt-4 text-sm leading-7 text-text-2">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="marker-label">Research translated into direction</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">The website should explain the gap Fair Squares can fill.</h2>
          <p className="mt-5 text-base leading-8 text-text-2">
            The research does not point to a generic real-estate product. It points to a specific need: projects where affordability lowers returns, but a smaller layer of mission-aligned capital can unlock homes that would otherwise be delayed, reduced or cancelled.
          </p>
          <Link href="/research" className="mt-6 inline-flex text-sm font-bold text-fs-magenta hover:underline">
            Read the source-backed direction →
          </Link>
        </div>
        <div className="open-card rounded-[2rem] p-5">
          <p className="px-2 pb-3 text-sm font-black text-text-1">Suitable project patterns</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {projectTypes.map((type) => (
              <div key={type} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/45 p-4 text-sm font-bold text-text-1">
                {type}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="marker-label">Evidence, not slogans</p>
            <h2 className="mt-3 text-4xl font-black">The public claim is simple and sourced.</h2>
          </div>
          <Link href="/research" className="text-sm font-bold text-fs-magenta hover:underline">
            Full source library →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {researchSources.slice(0, 3).map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="paper-lift rounded-[1.5rem] border border-border bg-white p-4 hover:border-fs-teal/50">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-fs-magenta">{source.publisher} · {source.year}</p>
              <h3 className="mt-3 text-lg font-black leading-tight">{source.title}</h3>
              <p className="mt-3 text-sm leading-6 text-text-2">{source.implication}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-8 rounded-[2.25rem] border border-fs-teal/20 bg-fs-anthracite p-6 text-white shadow-2xl shadow-black/10 md:p-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">Open to partners</p>
          <h2 className="mt-3 text-4xl font-black">Fair Squares is for projects where social value is clear but the financing gap is real.</h2>
          <p className="mt-5 text-sm leading-7 text-white/70">
            We are interested in housing plans that can show location, affordability target, funding gap and the homes enabled by filling that gap.
          </p>
        </div>
        <div className="grid content-start gap-3">
          {projectTypes.slice(0, 4).map((type) => (
            <div key={type} className="rounded-2xl border border-white/10 bg-white/7 p-4 text-sm font-bold">
              {type}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
