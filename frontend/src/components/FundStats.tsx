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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl bg-card p-5">
            <span className="text-xs text-text-3 font-medium uppercase tracking-wide">{card.label}</span>
            <p className="text-2xl font-bold mt-2">{formatEUR(props[card.key])}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6 text-[13px] text-text-3 flex-wrap">
        <span><strong className="text-text-1">{props.investorCount}</strong> investors</span>
        <span><strong className="text-fs-teal">{formatEUR(props.totalYield)}</strong> {eurs} yield paid</span>
        <span><strong className="text-text-1">~3%</strong> target annual return</span>
        <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-fs-mint text-fs-teal-dark font-medium">
          1 {fsft} = 1 {eurs} = €1
        </span>
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-fs-magenta/10 p-4 text-center text-fs-magenta text-sm font-medium">
          The fund is temporarily paused
        </div>
      )}
    </div>
  );
}
