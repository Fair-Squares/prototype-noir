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
  {
    key: "totalDeposits" as const,
    label: "Total Fund Size",
    icon: "🏦",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-100",
    valueColor: "text-emerald-700",
  },
  {
    key: "totalInDefi" as const,
    label: "Generating Yield",
    icon: "📈",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-100",
    valueColor: "text-teal-700",
  },
  {
    key: "totalAllocated" as const,
    label: "Reserved for Housing",
    icon: "🏠",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-100",
    valueColor: "text-amber-700",
  },
  {
    key: "available" as const,
    label: "Available to Deploy",
    icon: "💰",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-100",
    valueColor: "text-sky-700",
  },
];

export default function FundStats(props: FundStatsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className={`rounded-xl ${card.bgColor} border ${card.borderColor} p-5`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500 font-medium">{card.label}</span>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.valueColor}`}>
              {formatEUR(props[card.key])}
            </p>
          </div>
        ))}
      </div>

      {/* Secondary stats row */}
      <div className="flex items-center gap-6 px-1">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{props.investorCount}</span> investors
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-semibold text-emerald-600">{formatEUR(props.totalYield)}</span> total yield generated
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-semibold text-gray-900">3%</span> target APY
        </div>
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
          <span className="text-amber-700 font-medium">
            ⚠️ Fund is currently paused — deposits and withdrawals are disabled
          </span>
        </div>
      )}
    </div>
  );
}
