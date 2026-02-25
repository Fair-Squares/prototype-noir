"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
    <div className="space-y-12">
      {/* Hero */}
      <div className="flex items-center gap-12 py-12">
        <div className="flex-1">
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Affordable housing,<br />funded by the community
          </h1>
          <p className="text-lg text-text-2 leading-relaxed max-w-lg mb-8">
            We pool capital from investors to buy homes and rent them out at fair prices.
            Investors earn ~3% returns. Tenants pay 20% below market rent.
          </p>
          <div className="flex gap-3">
            <a href="/invest" className="px-5 py-2.5 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark">
              Start investing
            </a>
            <a href="/governance" className="px-5 py-2.5 rounded-lg bg-white border border-border text-text-2 text-sm font-semibold hover:text-text-1 hover:border-text-3">
              View proposals
            </a>
          </div>
        </div>
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative w-[280px] h-[280px] flex items-center justify-center">
            {/* Soft teal glow behind the logo */}
            <div className="absolute inset-0 bg-fs-teal/8 rounded-full blur-3xl" />
            <Image
              src="/brand/fs-dark-light-bg.png"
              alt="Fair Squares"
              width={180}
              height={180}
              className="relative z-10 drop-shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* EUR token banner */}
      <div className="rounded-2xl bg-card border border-border p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-1">
            <div className="w-9 h-9 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center">
              <span className="text-blue-700 text-xs font-bold">€</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-fs-mint border-2 border-white flex items-center justify-center">
              <span className="text-fs-teal-dark text-[10px] font-bold">FS</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-1">
              Powered by EURs &amp; FSFT
            </p>
            <p className="text-xs text-text-3 mt-0.5">
              EUR deposits are sent to the housing fund and tracked privately as deposit tickets. FSFT is minted only after governance-approved asset execution.
            </p>
          </div>
        </div>
        <a
          href="/invest"
          className="shrink-0 px-4 py-2 rounded-lg bg-fs-teal text-white text-xs font-semibold hover:bg-fs-teal-dark transition-colors"
        >
          Invest in EUR
        </a>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden">
        {[
          { value: "~3%", label: "Annual return for investors", sub: "Paid in EURs stablecoin" },
          { value: "20%", label: "Below market rent for tenants", sub: "Making housing affordable" },
          { value: "€0", label: "Minimum investment", sub: "Deposit any EUR amount" },
        ].map((item) => (
          <div key={item.label} className="bg-card p-8">
            <p className="text-3xl font-bold text-fs-teal mb-1">{item.value}</p>
            <p className="text-sm text-text-1 font-medium">{item.label}</p>
            <p className="text-xs text-text-3 mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Fund Overview */}
      <section>
        <h2 className="text-lg font-bold mb-5">Fund overview</h2>
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

      {/* How it works */}
      <section>
        <h2 className="text-lg font-bold mb-5">How it works</h2>
        <div className="rounded-2xl bg-card overflow-hidden">
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
      </section>

      {/* Comparison table */}
      <section>
        <h2 className="text-lg font-bold mb-5">Fair Squares vs traditional real estate</h2>
        <div className="rounded-2xl bg-card overflow-hidden">
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
