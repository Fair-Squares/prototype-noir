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
  fundTokenSymbol?: string;
  eurTokenSymbol?: string;
}

const STAT_CARDS = [
  { key: "totalDeposits" as const, label: "Total fund size" },
  { key: "totalInDefi" as const, label: "Earning returns" },
  { key: "totalAllocated" as const, label: "Reserved for housing" },
  { key: "available" as const, label: "Ready to deploy" },
];

export default function FundStats(props: FundStatsProps) {
  const fsft = props.fundTokenSymbol ?? "FSFT";
  const eurs = props.eurTokenSymbol ?? "EURs";

  const utilization = props.totalDeposits > 0
    ? Math.min(100, Math.round(((props.totalInDefi + props.totalAllocated) / props.totalDeposits) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {STAT_CARDS.map((card) => (
            <div key={card.key} className="rounded-xl bg-bg p-4 border border-border/60">
              <span className="text-[11px] text-text-3 font-medium uppercase tracking-wide">{card.label}</span>
              <p className="text-2xl font-brand-black mt-2">{formatEUR(props[card.key])}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-6 text-[13px] text-text-3 flex-wrap mb-3">
          <span><strong className="text-text-1">{props.investorCount}</strong> investors</span>
          <span><strong className="text-fs-teal">{formatEUR(props.totalYield)}</strong> {eurs} yield paid</span>
          <span><strong className="text-text-1">~3%</strong> target annual return</span>
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-fs-mint text-fs-teal-dark font-medium">
            1 {fsft} = 1 {eurs} = €1
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1 text-[11px] text-text-3">
            <span>Capital utilization</span>
            <span>{utilization}%</span>
          </div>
          <div className="h-2 rounded-full bg-bg border border-border/70 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fs-teal to-fs-magenta" style={{ width: `${utilization}%` }} />
          </div>
        </div>
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-fs-magenta/10 p-4 text-center text-fs-magenta text-sm font-medium">
          The fund is temporarily paused
        </div>
      )}
    </div>
  );
}
