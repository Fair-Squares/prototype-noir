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
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center py-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-6 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Prototype — Aztec Sandbox
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">
          Affordable Housing,{" "}
          <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Powered by Privacy
          </span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          A decentralised fund that pools investor capital to buy affordable housing.
          Your contributions are private. The fund&apos;s impact is public.
        </p>
      </div>

      {/* Fund Stats */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Fund Overview</h2>
        {error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-600 text-sm">
            Failed to load fund stats: {error}
          </div>
        ) : stats ? (
          <FundStats {...stats} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white border border-gray-200 animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="pt-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: "🔒",
              color: "bg-emerald-50 border-emerald-100",
              title: "Private Investment",
              desc: "Deposit funds privately — nobody can see who invested or how much. Only the total fund size is public.",
            },
            {
              icon: "🏠",
              color: "bg-teal-50 border-teal-100",
              title: "Community Governance",
              desc: "Vote on property acquisitions with private ballots. Results are public, your choice is hidden.",
            },
            {
              icon: "📈",
              color: "bg-cyan-50 border-cyan-100",
              title: "Sustainable Returns",
              desc: "Earn ~3% annual yield while helping fund affordable housing. Capped returns keep rents low.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className={`rounded-xl ${card.color} border p-6`}
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="text-gray-900 font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy explainer */}
      <section className="pt-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Built on Aztec Network</h2>
          <p className="text-gray-600 max-w-xl mx-auto leading-relaxed">
            Aztec is an Ethereum L2 with <strong className="text-gray-900">native privacy</strong>.
            Zero-knowledge proofs protect your investment data while keeping the fund
            fully transparent and auditable.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Private deposits
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              Private voting
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              Public fund totals
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
