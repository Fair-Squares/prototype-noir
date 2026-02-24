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
    accent: "text-fs-teal",
    borderAccent: "border-fs-teal/15",
    glow: "shadow-[0_0_24px_rgba(76,189,176,0.08)]",
  },
  {
    key: "totalInDefi" as const,
    label: "Generating Yield",
    accent: "text-fs-teal-light",
    borderAccent: "border-fs-teal/10",
    glow: "",
  },
  {
    key: "totalAllocated" as const,
    label: "Reserved for Housing",
    accent: "text-fs-magenta-light",
    borderAccent: "border-fs-magenta/15",
    glow: "shadow-[0_0_24px_rgba(196,22,103,0.06)]",
  },
  {
    key: "available" as const,
    label: "Available to Deploy",
    accent: "text-text-primary",
    borderAccent: "border-surface-border",
    glow: "",
  },
];

export default function FundStats(props: FundStatsProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className={`rounded-2xl bg-surface-card border ${card.borderAccent} p-5 ${card.glow} card-hover`}
          >
            <span className="text-sm text-text-muted font-medium block mb-3">{card.label}</span>
            <p className={`text-2xl font-bold ${card.accent} tracking-tight`}>
              {formatEUR(props[card.key])}
            </p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="flex items-center gap-6 px-1">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="font-semibold text-text-primary">{props.investorCount}</span> investors
        </div>
        <div className="w-px h-4 bg-surface-border" />
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="font-semibold text-fs-teal">{formatEUR(props.totalYield)}</span> yield generated
        </div>
        <div className="w-px h-4 bg-surface-border" />
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="font-semibold text-text-primary">3%</span> target APY
        </div>
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-fs-magenta/10 border border-fs-magenta/20 p-4 text-center">
          <span className="text-fs-magenta-light font-medium text-sm">
            Fund is currently paused -- deposits and withdrawals are disabled
          </span>
        </div>
      )}
    </div>
  );
}
