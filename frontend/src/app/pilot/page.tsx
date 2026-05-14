import { keyMetrics } from "@/lib/research";

const terms = [
  ["Product", "Viability-gap finance for mid-rent / affordable rental projects"],
  ["Project types", "New-build, transformation, building splits or rooftop additions with reduced planning and land risk"],
  ["Ticket", "Indicative €250k–€1.5m final-layer capital"],
  ["Return cap", "Target 3–4% net annual return, risk-adjusted and contractually capped"],
  ["Affordability", "15–25 year rent covenant, rent discount or income-linked rent formula"],
  ["Governance", "Consent rights on rent policy, refinancing, sale and covenant changes"],
  ["Reporting", "Open-book budget, annual affordability report and use-of-funds transparency"],
  ["Anti-speculation", "Fixed land/control terms, clawbacks and capped residual upside"],
];

const qualification = [
  "A real project with defined location, partner and planning path.",
  "Affordability requirements reduce expected return or debt capacity.",
  "The gap is documented with an open-book budget and senior debt assumptions.",
  "Fair Squares capital creates additional affordable homes or preserves affordability duration.",
  "Partner accepts reporting, covenant and anti-speculation protections.",
];

export default function PilotPage() {
  return (
    <div className="space-y-12">
      <section className="editorial-card rounded-[2.5rem] p-6 md:p-10">
        <p className="marker-label">Pilot product</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">
          Close the final financing gap without extracting the housing upside.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-text-2">
          Fair Squares starts with one practical product: capped-return capital that helps a specific affordable rental project work financially while locking in affordability obligations.
        </p>
        <a
          href="mailto:hello@fair-squares.nl?subject=Fair%20Squares%20pilot%20candidate"
          className="mt-8 inline-flex rounded-full bg-[#1f2a2e] px-6 py-3 text-sm font-bold text-[#fffaf2] shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:bg-fs-magenta"
        >
          Discuss a pilot candidate
        </a>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {terms.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-3">{label}</p>
            <p className="mt-2 text-base font-semibold leading-7 text-text-1">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="editorial-card rounded-[2rem] p-6 md:p-8">
          <p className="marker-label">Qualification checklist</p>
          <div className="mt-6 space-y-3">
            {qualification.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-bg p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fs-teal text-xs font-black text-white">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-text-2">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2.25rem] border border-text-1/10 bg-text-1 p-6 text-white shadow-2xl shadow-black/10 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-fs-teal-light">Success metrics</p>
          <h2 className="mt-3 text-3xl font-black">What the pilot must prove</h2>
          <div className="mt-6 space-y-3">
            {keyMetrics.map((metric) => (
              <div key={metric} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold leading-6">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
