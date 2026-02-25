"use client";

import { useEffect, useState } from "react";
import FundStats from "@/components/FundStats";
import { fetchFundStats, type FundStats as FundStatsType } from "@/lib/contracts";

export default function Dashboard() {
  const [stats, setStats] = useState<FundStatsType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFundStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-14">
      <section className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-10 md:p-14 lg:p-16">
            <h1 className="text-4xl md:text-5xl xl:text-6xl leading-[1.02] mb-5 max-w-2xl">
              Affordable housing,<br />funded by the community
            </h1>
            <p className="text-lg text-text-2 leading-relaxed max-w-xl mb-8">
              We pool capital from investors to buy homes and rent them out at fair prices.
              Investors earn ~3% returns. Tenants pay 20% below market rent.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/invest" className="px-5 py-2.5 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark">
                Start investing
              </a>
              <a href="/governance" className="px-5 py-2.5 rounded-lg bg-white border border-border text-text-2 text-sm font-semibold hover:text-text-1 hover:border-text-3">
                View proposals
              </a>
            </div>
          </div>

          <div className="relative fs-grid-overlay p-6 md:p-8 lg:p-10 bg-bg border-t lg:border-t-0 lg:border-l border-border">
            <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-fs-teal/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full bg-fs-magenta/10 blur-3xl" />

            <div className="relative space-y-4">
              <div className="rounded-2xl bg-white/90 border border-border p-5">
                <p className="text-[20px] font-semibold mb-2">Powered by EURs &amp; FSFT</p>
                <p className="text-[14px] text-text-2 mt-0.5 leading-relaxed">
                  EUR deposits are sent to the housing fund and tracked privately as deposit tickets. FSFT is minted only after governance-approved asset execution.
                </p>
                <a
                  href="/invest"
                  className="mt-5 inline-flex shrink-0 px-5 py-2.5 rounded-lg bg-fs-teal text-white text-[14px] font-semibold hover:bg-fs-teal-dark transition-colors"
                >
                  Invest in EUR
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
                {[
                  { value: "~3%", label: "Annual return for investors", sub: "Paid in EURs stablecoin" },
                  { value: "20%", label: "Below market rent for tenants", sub: "Making housing affordable" },
                  { value: "€0", label: "Minimum investment", sub: "Deposit any EUR amount" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-4xl text-fs-teal mb-2 leading-none">{item.value}</p>
                    <p className="text-[16px] text-text-1 font-medium leading-tight">{item.label}</p>
                    <p className="text-[13px] text-text-2 mt-1 leading-tight">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg mb-5">Fund overview</h2>
        {error ? (
          <div className="rounded-xl bg-card p-4 text-red-500 text-sm">
            Could not load fund data: {error}
          </div>
        ) : stats ? (
          <FundStats {...stats} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        )}
      </section>

      <section className="grid xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg/60">
            <h2 className="text-lg">How it works</h2>
          </div>
          {[
            {
              step: "1",
              title: "Investors deposit into the fund",
              desc: "Anyone who passes identity verification can invest. No minimum amount. Deposits are tracked privately as tickets in the housing fund.",
            },
            {
              step: "2",
              title: "The community picks properties to buy",
              desc: "A housing council proposes properties. Token holders vote on each acquisition. Majority decides.",
            },
            {
              step: "3",
              title: "A housing corporation manages the building",
              desc: "Once purchased, management rights go to a professional housing corporation. They handle tenants, maintenance, everything.",
            },
            {
              step: "4",
              title: "Tenants pay fair rent, investors earn returns",
              desc: "Rent is set at ~20% below market. Rental income goes to maintenance, management costs, and investor returns (~3% annually).",
            },
          ].map((item, i) => (
            <div
              key={item.step}
              className={`flex items-start gap-5 p-6 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="w-8 h-8 rounded-full bg-fs-mint text-fs-teal-dark flex items-center justify-center text-sm font-bold shrink-0">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-text-2 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg/60">
            <h2 className="text-lg">Fair Squares vs traditional real estate</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-text-3 font-medium"></th>
                <th className="text-left p-4 text-text-3 font-medium">Traditional</th>
                <th className="text-left p-4 text-fs-teal font-medium">Fair Squares</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Who can invest", "Large investors", "Anyone"],
                ["Investor returns", "6-8%", "~3% (capped)"],
                ["Rent level", "Market rate", "20% below market"],
                ["Decisions", "Behind closed doors", "Community vote"],
                ["Transparency", "Limited", "Fully auditable"],
                ["Building management", "Landlord", "Housing corporation"],
              ].map(([label, trad, fs], i) => (
                <tr key={label} className={i > 0 ? "border-t border-border" : ""}>
                  <td className="p-4 text-text-2">{label}</td>
                  <td className="p-4 text-text-3">{trad}</td>
                  <td className="p-4 text-text-1 font-medium">{fs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
