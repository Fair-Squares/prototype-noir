import { keyMetrics } from "@/lib/research";

const focusAreas = [
  ["Affordable-rent pressure", "The project is useful, but capped rents reduce the income traditional finance expects."],
  ["A defined funding gap", "The missing layer is visible in the project budget, not hidden in vague development risk."],
  ["Real additional homes", "Fair Squares capital should enable homes that would otherwise be delayed, reduced or not delivered."],
  ["Long-term affordability", "The public value comes from homes staying affordable, not only from getting built."],
];

const productShape = [
  ["Capital", "Patient, capped-return capital for a specific affordable housing project."],
  ["Outcome", "Homes enabled, rent level, affordability period and reporting commitments."],
  ["Protection", "Anti-speculation terms, open-book reporting and consent rights around affordability changes."],
  ["Audience", "Partners and investors who want measurable housing impact rather than maximum real-estate upside."],
];

export default function PilotPage() {
  return (
    <div className="space-y-12">
      <section className="open-card rounded-[2.5rem] p-6 md:p-10">
        <p className="marker-label">Fair Squares fit</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">
          A practical capital layer for affordable housing gaps.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-text-2">
          The first Fair Squares use case is not a generic investment product. It is a focused way to help affordable rental projects work when the social rent target creates a financing gap.
        </p>
        <a
          href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20housing%20project"
          className="mt-8 inline-flex rounded-full bg-fs-magenta px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fs-magenta/20 hover:-translate-y-0.5 hover:bg-fs-anthracite"
        >
          Share a suitable project
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
          <p className="marker-label">Product shape</p>
          <div className="mt-6 space-y-3">
            {productShape.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-white p-4">
                <p className="text-sm font-black text-fs-magenta">{label}</p>
                <p className="mt-2 text-sm leading-6 text-text-2">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2.25rem] border border-fs-teal/20 bg-fs-anthracite p-6 text-white shadow-2xl shadow-black/10 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">What should be visible</p>
          <h2 className="mt-3 text-3xl font-black">The public should be able to understand what the capital enabled.</h2>
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
