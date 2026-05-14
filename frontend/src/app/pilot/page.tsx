import { coreProblem, keyMetrics, protocolFit } from "@/lib/research";

const focusAreas = [
  ["Rent caps create the gap", "The home is needed and affordable, but the lower rent weakens the business case."],
  ["Land and permits stay outside the bet", "Fair Squares should enter after the project is concrete enough to avoid subsidising speculative land value."],
  ["Capital is capped by design", "The return profile should match the mission: enough to attract patient capital, not enough to extract the housing upside."],
  ["The protocol makes it legible", "Funding, governance, eligibility and reporting should make the project understandable to participants and the public."],
];

export default function PilotPage() {
  return (
    <div className="space-y-12">
      <section className="open-card rounded-[2.5rem] p-6 md:p-10">
        <p className="marker-label">Fair Squares use case</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">
          Capped-return capital for affordable housing projects that almost work.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-text-2">
          {coreProblem.short} Fair Squares fits the moment where a project has demand, a partner and a real affordability target, but needs a better capital layer to move forward.
        </p>
        <a
          href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20gap"
          className="mt-8 inline-flex rounded-full bg-fs-magenta px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
        >
          Share a housing gap
        </a>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {focusAreas.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-fs-teal/20 bg-fs-mint/55 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-fs-teal-dark">{label}</p>
            <p className="mt-2 text-base font-semibold leading-7 text-text-1">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="open-card rounded-[2rem] p-6 md:p-8">
          <p className="marker-label">What Fair Squares already supports</p>
          <div className="mt-6 space-y-3">
            {protocolFit.map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-white p-4 text-sm font-bold leading-6 text-text-1">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2.25rem] border border-fs-teal/20 bg-fs-anthracite p-6 text-white shadow-2xl shadow-black/10 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">What should be visible</p>
          <h2 className="mt-3 text-3xl font-black">A housing-finance product should prove the housing result.</h2>
          <div className="mt-6 space-y-3">
            {keyMetrics.slice(0, 5).map((metric) => (
              <div key={metric} className="rounded-2xl border border-white/10 bg-white/7 p-4 text-sm font-semibold leading-6">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
