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
    <div className="space-y-12">
      {/* Hero */}
      <div className="relative py-20 text-center overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-fs-teal/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-fs-magenta/6 rounded-full blur-3xl" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-fs-teal/10 text-fs-teal text-sm font-medium mb-8 border border-fs-teal/20">
          <span className="w-2 h-2 rounded-full bg-fs-teal animate-pulse" />
          Prototype on Aztec v4
        </div>

        <h1 className="text-5xl md:text-6xl font-bold mb-5 tracking-tight leading-tight">
          Affordable Housing,{" "}
          <span className="gradient-text-brand">
            Powered by Privacy
          </span>
        </h1>

        <p className="text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
          A decentralised fund that pools investor capital to buy affordable housing.
          Your contributions are private. The fund&apos;s impact is public.
        </p>
      </div>

      {/* Fund Stats */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">Fund Overview</h2>
          <span className="text-xs text-text-muted font-medium bg-surface-card px-3 py-1 rounded-full border border-surface-border">
            Live Data
          </span>
        </div>
        {error ? (
          <div className="rounded-xl bg-fs-magenta/10 border border-fs-magenta/20 p-4 text-fs-magenta-light text-sm">
            Failed to load fund stats: {error}
          </div>
        ) : stats ? (
          <FundStats {...stats} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-surface-card border border-surface-border animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-xl font-bold text-text-primary mb-6">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              ),
              color: "text-fs-teal",
              borderColor: "border-fs-teal/15 hover:border-fs-teal/30",
              glowColor: "group-hover:shadow-[0_0_30px_rgba(76,189,176,0.08)]",
              title: "Private Investment",
              desc: "Deposit funds privately. Nobody can see who invested or how much. Only the total fund size is public.",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5Z" />
                </svg>
              ),
              color: "text-fs-magenta-light",
              borderColor: "border-fs-magenta/15 hover:border-fs-magenta/30",
              glowColor: "group-hover:shadow-[0_0_30px_rgba(196,22,103,0.08)]",
              title: "Community Governance",
              desc: "Vote on property acquisitions with private ballots. Results are public, your choice is hidden.",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                </svg>
              ),
              color: "text-fs-teal-light",
              borderColor: "border-fs-teal/15 hover:border-fs-teal/30",
              glowColor: "group-hover:shadow-[0_0_30px_rgba(76,189,176,0.08)]",
              title: "Sustainable Returns",
              desc: "Earn ~3% annual yield while helping fund affordable housing. Capped returns keep rents low.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className={`group rounded-2xl bg-surface-card border ${card.borderColor} p-6 transition-all duration-300 ${card.glowColor}`}
            >
              <div className={`${card.color} mb-4`}>{card.icon}</div>
              <h3 className="text-text-primary font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Aztec explainer */}
      <section>
        <div className="relative rounded-2xl bg-gradient-to-br from-surface-card to-surface-raised border border-surface-border p-10 text-center overflow-hidden">
          {/* Subtle background gradient */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-fs-teal/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-fs-magenta/4 rounded-full blur-3xl" />
          </div>

          <h2 className="text-2xl font-bold text-text-primary mb-3">Built on Aztec Network</h2>
          <p className="text-text-secondary max-w-xl mx-auto leading-relaxed">
            Aztec is an Ethereum L2 with <strong className="text-text-primary">native privacy</strong>.
            Zero-knowledge proofs protect your investment data while keeping the fund
            fully transparent and auditable.
          </p>
          <div className="flex items-center justify-center gap-8 mt-8 text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-fs-teal" />
              Private deposits
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-fs-magenta" />
              Private voting
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-fs-teal-light" />
              Public fund totals
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
