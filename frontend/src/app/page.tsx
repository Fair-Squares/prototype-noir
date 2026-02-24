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
    <div className="space-y-16">
      {/* Hero */}
      <div className="text-center py-16">
        <h1 className="text-5xl font-bold mb-5 tracking-tight leading-tight text-fs-anthracite">
          Invest in housing.{" "}
          <span className="text-fs-teal">Keep your privacy.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-xl mx-auto leading-relaxed">
          We pool money from investors to buy affordable rental homes.
          You earn returns. Tenants get fair rents. Everyone wins.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <a
            href="/invest"
            className="px-6 py-3 rounded-lg bg-fs-teal text-white font-semibold hover:bg-fs-teal-dark"
          >
            Start Investing
          </a>
          <a
            href="/governance"
            className="px-6 py-3 rounded-lg border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50"
          >
            View Proposals
          </a>
        </div>
      </div>

      {/* Fund Stats */}
      <section>
        <h2 className="text-lg font-bold text-fs-anthracite mb-5">The Fund</h2>
        {error ? (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-red-600 text-sm">
            Could not load fund data: {error}
          </div>
        ) : stats ? (
          <FundStats {...stats} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-50 animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-lg font-bold text-fs-anthracite mb-5">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              title: "You invest",
              desc: "Put money into the fund. Your identity is never shared with anyone -- not even us.",
              color: "bg-fs-mint text-fs-teal-dark",
            },
            {
              step: "2",
              title: "We buy homes",
              desc: "The community votes on which properties to buy. Buildings are rented out at fair prices.",
              color: "bg-pink-50 text-fs-magenta",
            },
            {
              step: "3",
              title: "You earn returns",
              desc: "Rental income flows back to investors. Target return is ~3% per year, capped to keep rents low.",
              color: "bg-fs-mint text-fs-teal-dark",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-xl bg-white border border-gray-100 p-6">
              <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center font-bold text-sm mb-4`}>
                {card.step}
              </div>
              <h3 className="font-semibold text-fs-anthracite mb-2">{card.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy section */}
      <section>
        <div className="rounded-2xl bg-fs-mint border border-fs-teal/10 p-10 text-center">
          <h2 className="text-2xl font-bold text-fs-anthracite mb-3">Your privacy is built in</h2>
          <p className="text-gray-600 max-w-lg mx-auto leading-relaxed">
            Nobody can see how much you invested or when. The fund&apos;s total size
            and impact are public, but individual contributions are completely private.
          </p>
          <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-fs-teal" />
              Private investments
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-fs-magenta" />
              Anonymous voting
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-fs-anthracite" />
              Transparent fund totals
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
