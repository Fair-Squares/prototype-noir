import Link from "next/link";
import { coreProblem, fairSquaresDirection, protocolFit, researchSources } from "@/lib/research";

const problemFlow = [
  ["1", "Affordability rules lower income", "Rent limits protect households, but they also reduce the revenue a project can use to pay debt and investors."],
  ["2", "Broad subsidies can leak away", "CPB warns that generic support can raise land values when supply cannot respond quickly."],
  ["3", "Good projects need a different layer", "Where demand is clear and costs are real, capped-return capital can bridge the gap without turning housing into speculation."],
];

const projectTypes = [
  "Regulated mid-rent homes",
  "Rooftop additions",
  "Building splits",
  "Transformations to rental homes",
  "Corporation or social-developer gaps",
  "Municipality-backed affordable supply",
];

export default function HomePage() {
  return (
    <div className="space-y-14 overflow-hidden">
      <section className="relative rounded-[2.25rem] border border-fs-teal/20 bg-white/84 px-6 py-10 shadow-2xl shadow-fs-anthracite/10 md:px-12 md:py-16 lg:px-14">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fs-teal/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 h-72 w-72 rounded-full bg-fs-magenta/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-4xl">
            <p className="marker-label mb-5">Fair Squares · Affordable housing finance</p>
            <h1 className="max-w-5xl text-5xl font-black text-text-1 md:text-7xl lg:text-8xl">
              Finance the gap between affordable rent and buildable homes.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-2 md:text-xl">
              {coreProblem.long}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20project"
                className="inline-flex items-center justify-center rounded-full bg-fs-magenta px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
              >
                Discuss a housing gap
              </a>
              <Link
                href="/research"
                className="inline-flex items-center justify-center rounded-full border border-fs-teal/35 bg-fs-mint px-6 py-3 text-sm font-bold text-fs-teal-dark hover:-translate-y-0.5 hover:bg-white"
              >
                Read the CPB direction
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-fs-teal/25 bg-fs-mint/65 p-4 shadow-xl shadow-fs-anthracite/10">
            <div className="rounded-[1.6rem] bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-fs-magenta">Core problem</p>
              <h2 className="mt-4 text-3xl font-black text-text-1 md:text-4xl">{coreProblem.short}</h2>
              <p className="mt-4 text-sm leading-7 text-text-2">
                Fair Squares should not sell “real estate exposure”. It should make the missing affordability capital visible, fundable and accountable.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-fs-mint p-4">
                  <p className="text-2xl font-black text-fs-teal-dark">Gap</p>
                  <p className="mt-1 text-xs text-text-2">not subsidy</p>
                </div>
                <div className="rounded-2xl bg-bg p-4">
                  <p className="text-2xl font-black text-text-1">Homes</p>
                  <p className="mt-1 text-xs text-text-2">not land</p>
                </div>
                <div className="rounded-2xl bg-fs-magenta/10 p-4">
                  <p className="text-2xl font-black text-fs-magenta">Proof</p>
                  <p className="mt-1 text-xs text-text-2">not hype</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {problemFlow.map(([num, title, body]) => (
          <div key={title} className="paper-lift open-card rounded-[2rem] p-6">
            <p className="mb-5 text-sm font-black text-fs-magenta">{num}</p>
            <h3 className="text-2xl font-black text-text-1">{title}</h3>
            <p className="mt-4 text-sm leading-7 text-text-2">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="marker-label">In line with the protocol</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">Fair Squares already has the right building blocks.</h2>
          <p className="mt-5 text-base leading-8 text-text-2">
            The public front-end should connect the research to what the product can actually do: pool capital, show project data, let participants govern key changes and report whether affordability promises are kept.
          </p>
          <Link href="/fund" className="mt-6 inline-flex text-sm font-bold text-fs-magenta hover:underline">
            View the protocol app →
          </Link>
        </div>
        <div className="open-card rounded-[2rem] p-5">
          <div className="grid gap-3">
            {protocolFit.map((item) => (
              <div key={item} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/45 p-4 text-sm font-bold leading-6 text-text-1">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        {fairSquaresDirection.map((card) => (
          <div key={card.title} className="paper-lift rounded-[2rem] border border-border bg-white p-6">
            <h3 className="text-xl font-black text-text-1">{card.title}</h3>
            <p className="mt-4 text-sm leading-7 text-text-2">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="marker-label">Where this applies</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">Use the capital where it creates supply, not just a nicer spreadsheet.</h2>
          <p className="mt-5 text-base leading-8 text-text-2">
            CPB is clear that more homes matter. Fair Squares is strongest where a targeted capital layer can unlock efficient supply under affordability constraints.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {projectTypes.map((type) => (
            <div key={type} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/55 p-4 text-sm font-bold text-text-1">
              {type}
            </div>
          ))}
        </div>
      </section>

      <section className="open-card rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="marker-label">Source-backed</p>
            <h2 className="mt-3 text-4xl font-black">The claim is narrow, practical and sourced.</h2>
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
    </div>
  );
}
