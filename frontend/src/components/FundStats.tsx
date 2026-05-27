"use client";

import { formatEUR } from "@/lib/contracts";
import InfoTooltip from "@/components/InfoTooltip";

interface FundStatsProps {
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  available: number;
  totalYield: number;
  isPaused: boolean;
  investorCount: number;
  totalSupply: number;
  tokenPriceBps?: number;
  navEur?: number;
  navPerFsftEur?: number;
  fundTokenSymbol?: string;
  eurTokenSymbol?: string;
}

const STAT_CARDS = [
  {
    key: "totalDeposits" as const,
    label: "Total fund size",
    tooltip: "All EURs currently in the fund.",
  },
  {
    key: "totalInDefi" as const,
    label: "Earning now",
    tooltip: "EUR currently earning while no purchase is active.",
  },
  {
    key: "totalAllocated" as const,
    label: "Reserved for housing",
    tooltip: "EUR set aside for approved purchases.",
  },
  {
    key: "available" as const,
    label: "Ready to deploy",
    tooltip: "Unused EUR that can be used next.",
  },
];

export default function FundStats(props: FundStatsProps) {
  const fsft = props.fundTokenSymbol ?? "FSFT";
  const eurs = props.eurTokenSymbol ?? "EURs";
  const navEur = props.navEur ?? Math.max(0, props.totalDeposits + props.totalYield);
  const navPerFsftEur = props.navPerFsftEur ?? (props.totalSupply > 0 ? navEur / props.totalSupply : 0);
  const issueRefEur = props.tokenPriceBps && props.tokenPriceBps > 0 ? props.tokenPriceBps / 10000 : null;

  const utilization = props.totalDeposits > 0
    ? Math.min(100, Math.round(((props.totalInDefi + props.totalAllocated) / props.totalDeposits) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          {STAT_CARDS.map((card) => (
            <div key={card.key} className="p-5 bg-card">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] text-text-3 font-medium uppercase tracking-wide">{card.label}</p>
                <InfoTooltip text={card.tooltip} />
              </div>
              <p className="text-2xl mt-2 leading-none">{formatEUR(props[card.key])}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="surface p-4">
        <div className="grid md:grid-cols-[1fr_180px] gap-4 items-end">
          <div className="space-y-2">
            <div className="flex items-center gap-6 text-[14px] text-text-3 flex-wrap">
              <span><strong className="text-text-1">{props.investorCount}</strong> investors</span>
              <span><strong className="text-fs-teal">{formatEUR(props.totalYield)}</strong> {eurs} yield paid</span>
              <span className="inline-flex items-center gap-1.5">
                <strong className="text-text-1">~3%</strong> target annual return
                <InfoTooltip text="Demo target only. Not guaranteed." />
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 text-[12px] text-text-3">
                <span className="inline-flex items-center gap-1.5">
                  Capital utilization
                  <InfoTooltip text="How much of the fund is already in use or reserved." />
                </span>
                <span>{utilization}%</span>
              </div>
              <div className="h-2 rounded-full bg-bg border border-border/70 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-fs-teal to-fs-magenta" style={{ width: `${utilization}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-fs-mint text-fs-teal-dark px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold">Estimated share price / {fsft}</p>
            <p className="text-base font-semibold mt-0.5">€{navPerFsftEur.toFixed(4)}</p>
            <p className="text-[11px] mt-1">
              Fund value: {formatEUR(navEur)} {issueRefEur !== null ? `• Starting ref: €${issueRefEur.toFixed(4)}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg px-4 py-3 text-xs text-text-2">
        When no purchase is active, the fund may place part of unused EUR in lending to avoid idle cash.
      </div>

      {props.isPaused && (
        <div className="rounded-xl bg-fs-magenta/10 p-4 text-center text-fs-magenta text-sm font-medium">
          The fund is temporarily paused
        </div>
      )}
    </div>
  );
}
