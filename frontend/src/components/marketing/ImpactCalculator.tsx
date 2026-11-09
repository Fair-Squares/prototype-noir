"use client";

import { useEffect, useState } from "react";
import { fetchFundStats } from "@/lib/contracts";
import { ModelledChip } from "@/components/ui";
import RuntimeModeChip from "@/components/RuntimeModeChip";

interface ImpactCalculatorProps {
  /**
   * Seed ROR (basis points) from a parent that already loaded fund stats
   * (page.tsx passes `stats?.rorBps`). The component still self-fetches on
   * mount so /learn works standalone; the fetched value wins once it lands.
   */
  initialRorBps?: number;
}

// Illustrative city cost factors — drive the MODELLED ownership share +
// tenant-saving figures only. The annual return uses the REAL on-chain ROR.
const CITIES: Record<string, number> = {
  Amsterdam: 1.0,
  Rotterdam: 0.82,
  Utrecht: 0.9,
  "The Hague": 0.86,
};

const MIN_AMOUNT = 500;
const MAX_AMOUNT = 50_000;
const DEFAULT_ROR_BPS = 300; // canonical 3% — matches sim + the documented ROR example.

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Impact calculator — the marketing site's interactive widget.
 *
 * Honesty contract (binding, see CLAUDE.md):
 *   • Annual return is the ONLY untagged/real number. It is the on-chain ROR
 *     formula `round(amount * rorBps / 10000)`, with rorBps sourced from
 *     /api/fund/stats (HousingFund.ror_bps) → initialRorBps → 300. The result
 *     card is sub-labelled "based on the on-chain ROR" so the label matches the
 *     exact source.
 *   • Ownership share + tenant rent saving are illustrative formulas; each
 *     carries its own <ModelledChip/>, and the dark panel footer restates it.
 *   • The runtime label is the honest <RuntimeModeChip/> ("Demo network · no
 *     real funds"), never the kit's "Public testnet".
 */
export function ImpactCalculator({ initialRorBps }: ImpactCalculatorProps) {
  const [amount, setAmount] = useState(8000);
  const [city, setCity] = useState<string>("Amsterdam");
  const [rorBps, setRorBps] = useState<number>(initialRorBps ?? DEFAULT_ROR_BPS);
  // Honesty flag: only true once the figure actually came from the chain (prop
  // or fetch) — the sub-label must not claim "on-chain" for the seeded default.
  const [rorIsLive, setRorIsLive] = useState<boolean>(initialRorBps != null);

  // Self-fetch the real ROR on mount so /learn resolves standalone. No retry /
  // polling (CLAUDE.md error-handling rule); a failed read just keeps the
  // seeded/default value rather than masking it.
  useEffect(() => {
    let cancelled = false;
    fetchFundStats()
      .then((stats) => {
        if (!cancelled && typeof stats.rorBps === "number") {
          setRorBps(stats.rorBps);
          setRorIsLive(true);
        }
      })
      .catch(() => {
        /* keep initialRorBps ?? DEFAULT_ROR_BPS — never mask with a wrong value */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const factor = CITIES[city];

  // REAL: on-chain ROR formula. Keep this exact — it tracks HousingFund.ror_bps.
  const annualReturn = Math.round((amount * rorBps) / 10000);

  // MODELLED: illustrative ownership + tenant-saving overlays.
  const share = Math.min(100, +((amount / (320_000 * factor)) * 100).toFixed(2));
  const tenantSaving = Math.round(amount * 0.046 * factor);

  return (
    <div className="grid items-stretch gap-10 md:grid-cols-[0.82fr_1.18fr]">
      {/* ── Controls ──────────────────────────────────────────────── */}
      <div>
        <p className="text-label">Impact calculator</p>
        <h2 className="text-display mt-3">See the value you create.</h2>
        <p className="text-body mt-4 max-w-prose text-text-2">
          Adjust your investment and location to see the measurable benefits for
          you and for tenants.
        </p>

        <div className="mt-8">
          <label htmlFor="impact-amount" className="text-caption font-semibold text-text-2">
            Investment amount
          </label>
          <div className="text-kpi mt-2 mb-1 text-text-1">€{fmt(amount)}</div>
          <input
            id="impact-amount"
            name="impact-amount"
            type="range"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step={500}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="range-teal mt-2"
            aria-valuetext={`€${fmt(amount)}`}
          />
          <div className="mt-1 flex justify-between text-caption text-text-3">
            <span>€{fmt(MIN_AMOUNT)}</span>
            <span>€{fmt(MAX_AMOUNT)}</span>
          </div>
        </div>

        <div className="mt-7">
          <span className="text-caption font-semibold text-text-2">Location</span>
          <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label="Location">
            {Object.keys(CITIES).map((c) => {
              const active = city === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  aria-pressed={active}
                  className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Results (dark panel) ──────────────────────────────────── */}
      <div className="panel-dark relative overflow-hidden p-8 sm:p-10">
        <div className="dot-pattern pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative flex flex-col gap-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-light.png" alt="Fair Squares" className="h-6 w-auto" />
            <span className="ml-auto">
              <RuntimeModeChip />
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* REAL — the one untagged number. */}
            <ResultCard
              label="Your return / yr"
              value={`€${fmt(annualReturn)}`}
              sub={rorIsLive ? "based on the on-chain ROR" : "canonical 3% — on-chain ROR not loaded"}
            />
            {/* MODELLED — illustrative ownership share. */}
            <ResultCard
              label="Ownership share"
              value={`${share}%`}
              sub={`of a home in ${city}`}
              chip
            />
          </div>

          {/* MODELLED — tenant rent saving highlight. */}
          <div className="rounded-[18px] bg-white/[0.06] p-6">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 flex-none rounded-[11px] bg-fs-magenta"
                aria-hidden="true"
              />
              <div>
                <div className="text-[0.8125rem] leading-snug text-fs-mint/90">
                  You help lower a tenant&rsquo;s rent by
                </div>
                <div className="text-display mt-1.5 text-white">
                  ~€{fmt(tenantSaving)}
                  <span className="text-caption font-medium text-fs-mint/70"> / year</span>
                </div>
              </div>
              <span className="ml-auto self-start">
                <ModelledChip />
              </span>
            </div>
          </div>

          <p className="text-caption text-fs-mint/50">
            Return uses the live on-chain ROR; ownership share and tenant saving
            are modelled for the demo.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ResultCardProps {
  label: string;
  value: string;
  sub: string;
  /** When true, the sub-figure is illustrative → carries a ModelledChip. */
  chip?: boolean;
}

function ResultCard({ label, value, sub, chip = false }: ResultCardProps) {
  return (
    <div className="rounded-[18px] bg-white/[0.06] p-5">
      <div className="text-caption text-fs-mint/70">{label}</div>
      <div className="text-kpi mt-3 mb-1.5 text-white">{value}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-fs-mint/60">{sub}</span>
        {chip ? <ModelledChip /> : null}
      </div>
    </div>
  );
}

export default ImpactCalculator;
