"use client";

import { formatEUR } from "@/lib/contracts";

interface FundStatsProps {
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  available: number;
  totalYield: number;
  isPaused: boolean;
  investorCount: number;
  totalSupply: number;
}

const STAT_CARDS = [
  { key: "totalDeposits" as const, label: "Fund Size", color: "text-fs-teal" },
  { key: "totalInDefi" as const, label: "Earning Returns", color: "text-fs-anthracite" },
  { key: "totalAllocated" as const, label: "In Housing", color: "text-fs-magenta" },
  { key: "available" as const, label: "Ready to Deploy", color: "text-fs-anthracite" },
];

export default function FundStats(props: FundStatsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl bg-gray-50 p-5">
            <span className="text-sm text-gray-400 font-medium">{card.label}</span>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>
              {formatEUR(props[card.key])}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6 px-1 text-sm text-gray-400">
        <span><strong className="text-fs-anthracite">{props.investorCount}</strong> investors</span>
        <span className="text-gray-200">|</span>
        <span><strong className="text-fs-teal">{formatEUR(props.totalYield)}</strong> returns paid out</span>
        <span className="text-gray-200">|</span>
        <span><strong className="text-fs-anthracite">~3%</strong> yearly return</span>
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center text-amber-700 text-sm font-medium">
          The fund is temporarily paused. No deposits or withdrawals at this time.
        </div>
      )}
    </div>
  );
}
