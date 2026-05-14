import Link from "next/link";
import { productionPath, researchSources } from "@/lib/research";

const problemCards = [
  {
    title: "Affordability lowers yield",
    body: "Mid-rent and affordable rental projects often become unfinanceable once rents are capped, even when the social value is obvious.",
  },
  {
    title: "Subsidies can leak away",
    body: "Broad support can end up in land prices when planning and land supply are constrained. Capital has to be tied to a documented gap.",
  },
  {
    title: "Corporations hit balance limits",
    body: "Mission-driven operators accept lower returns, but lower rents also reduce borrowing capacity and slow their pipeline.",
  },
];

const steps = [
  "Partner brings a shovel-ready or transformation project with capped-rent goals.",
  "Fair Squares validates the open-book viability gap and affordability covenant.",
  "Social investors provide patient junior/preferred capital with a capped 3–4% return.",
  "The project proceeds while rents stay affordable for a locked minimum period.",
];

const terms = [
  ["Pilot product", "Viability-gap finance for mid-rent / affordable rental projects"],
  ["Ticket", "€250k–€1.5m final-layer capital per project"],
  ["Return", "Capped investor return, target 3–4% net depending on risk"],
  ["Affordability", "Minimum 15–25 year rent covenant or income-linked rent formula"],
  ["Governance", "Consent rights on rent policy, refinancing, sale and covenant changes"],
  ["Protection", "Anti-speculation clawbacks on sale/refinancing and open-book reporting"],
];

const partnerTypes = ["Municipality", "Housing corporation", "Social developer", "Owner with transformation/optopping opportunity"];

export default function HomePage() {
  return (
    <div className="space-y-16 overflow-hidden">
      <section className="relative rounded-[2rem] border border-border bg-[#fbfaf6] px-6 py-10 shadow-sm md:px-12 md:py-16">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-fs-teal/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-fs-magenta/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div className="max-w-4xl">
            <p className="mb-5 inline-flex rounded-full border border-fs-teal/30 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-dark">
              Pilot thesis · Affordable housing capital
            </p>
            <h1 className="max-w-5xl text-4xl font-black tracking-tight text-text-1 md:text-6xl lg:text-7xl">
              Capped-return capital for housing projects the market leaves unfunded.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-2 md:text-xl">
              Fair Squares fills the last layer of patient capital for socially valuable affordable rental projects, so homes can be built or transformed without forcing rents to market levels.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20pilot%20project"
                className="inline-flex items-center justify-center rounded-xl bg-fs-magenta px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fs-magenta/20 hover:bg-fs-magenta-light"
              >
                Bring a pilot project
              </a>
              <Link
                href="/fund"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-6 py-3 text-sm font-bold text-text-1 hover:border-fs-teal/50"
              >
                View protocol app
              </Link>
            </div>
          </div>

          <div className="relative rounded-3xl border border-text-1/10 bg-white p-5 shadow-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-3">First pilot focus</p>
            <div className="mt-4 rounded-2xl bg-text-1 p-6 text-white">
              <p className="text-sm text-white/60">Best first product</p>
              <h2 className="mt-3 text-3xl font-black leading-tight">Viability-gap finance for capped-rent rental projects</h2>
              <p className="mt-4 text-sm leading-6 text-white/70">
                Not full property acquisition. Not a broad subsidy. A disciplined final capital layer that makes a specific affordable project proceed.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-fs-mint p-4">
                <p className="text-2xl font-black text-fs-teal-dark">3–4%</p>
                <p className="mt-1 text-xs text-text-2">return cap</p>
              </div>
              <div className="rounded-2xl bg-bg p-4">
                <p className="text-2xl font-black text-text-1">15y+</p>
                <p className="mt-1 text-xs text-text-2">affordability</p>
              </div>
              <div className="rounded-2xl bg-fs-magenta/10 p-4">
                <p className="text-2xl font-black text-fs-magenta">Open</p>
                <p className="mt-1 text-xs text-text-2">book gap</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {problemCards.map((card, index) => (
          <div key={card.title} className="rounded-3xl border border-border bg-card p-6">
            <p className="mb-5 text-sm font-black text-fs-magenta">0{index + 1}</p>
            <h3 className="text-2xl font-black">{card.title}</h3>
            <p className="mt-4 text-sm leading-7 text-text-2">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-dark">CPB-backed wedge</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">The issue is not only housing shortage. It is finance design.</h2>
          <p className="mt-5 text-base leading-8 text-text-2">
            CPB research points to the same tension from multiple angles: affordability rules can reduce available supply, broad subsidies can inflate land values, and housing corporations face balance-sheet limits. Fair Squares turns mission-aligned investor capital into lower-cost project capital, with upside deliberately capped so affordability is not competed away.
          </p>
          <Link href="/research" className="mt-6 inline-flex text-sm font-bold text-fs-magenta hover:underline">
            Read the research base →
          </Link>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={step} className="flex gap-4 rounded-2xl bg-bg p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-fs-teal-dark">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-text-2">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-dark">Evidence, not vibes</p>
            <h2 className="mt-3 text-4xl font-black">The public claims are source-backed.</h2>
          </div>
          <Link href="/research" className="text-sm font-bold text-fs-magenta hover:underline">
            Full source library →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {researchSources.slice(0, 3).map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-border bg-bg p-4 hover:border-fs-teal/50">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-fs-magenta">{source.publisher} · {source.year}</p>
              <h3 className="mt-3 text-lg font-black leading-tight">{source.title}</h3>
              <p className="mt-3 text-sm leading-6 text-text-2">{source.takeaway}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-magenta">Draft pilot term sheet</p>
            <h2 className="mt-3 text-4xl font-black">Make the first conversation concrete.</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-text-2">
            These are starting points for a municipality, housing corporation, social developer or property owner with a real financing gap.
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {terms.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-bg p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-3">{label}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-text-1">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-magenta">Production path</p>
        <h2 className="mt-3 text-4xl font-black">Build the finance wrapper before scaling the protocol.</h2>
        <div className="mt-8 grid gap-3">
          {productionPath.map((item) => (
            <div key={item.phase} className="grid gap-4 rounded-2xl bg-bg p-4 md:grid-cols-[64px_1fr_140px] md:items-start">
              <p className="text-3xl font-black text-fs-teal-dark">{item.phase}</p>
              <div>
                <h3 className="text-xl font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-2">{item.body}</p>
              </div>
              <p className="rounded-full bg-white px-3 py-1 text-center text-xs font-bold uppercase tracking-[0.14em] text-text-3">{item.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 rounded-[2rem] border border-text-1/10 bg-text-1 p-6 text-white md:p-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">Partner ask</p>
          <h2 className="mt-3 text-4xl font-black">Do you have a socially desirable project blocked by low affordable-rent returns?</h2>
          <p className="mt-5 text-sm leading-7 text-white/65">
            We are looking for one practical pilot where patient capped-return capital can close a documented gap and preserve affordability.
          </p>
        </div>
        <div className="grid content-start gap-3">
          {partnerTypes.map((type) => (
            <div key={type} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-bold">
              {type}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
