import { StatusChip } from "@/components/ui";

export interface RentComparisonProps {
  /** Appraiser-attested MONTHLY market rent (EUR) from the listing dossier. */
  marketRentEur: number;
  /** Covenant-capped MONTHLY rent (EUR): floor(floor(ask * ceiling_bps / 10000) / 12). */
  cappedRentEur: number;
  className?: string;
}

/**
 * J3: the affordability surface — "market €X → capped at €Y (−Z%)".
 * Renders only from on-chain covenant terms + the attested market reference
 * (never modelled data), so it carries no ModelledChip. The baseline chip
 * appears when the discount meets the protocol's 20%-below-market floor.
 */
export function RentComparison({ marketRentEur, cappedRentEur, className }: RentComparisonProps) {
  if (marketRentEur <= 0) {
    throw new Error("RentComparison requires a positive market rent reference");
  }
  const discountPct = Math.floor(((marketRentEur - cappedRentEur) / marketRentEur) * 100);
  const meetsBaseline = discountPct >= 20;

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className ?? ""}`}>
      <span className="text-body-sm text-text-2">
        Market rent{" "}
        <span className="text-mono text-text-1">
          €{marketRentEur.toLocaleString("en-IE")}/mo
        </span>
        {" → capped at "}
        <span className="text-mono text-text-1">
          €{cappedRentEur.toLocaleString("en-IE")}/mo
        </span>{" "}
        <span className={meetsBaseline ? "font-semibold text-[var(--color-success)]" : "font-semibold text-text-1"}>
          (−{discountPct}%)
        </span>
      </span>
      {meetsBaseline ? (
        <StatusChip status="verified" label="20% baseline met" />
      ) : (
        <StatusChip status="pending" label="Below the 20% baseline" />
      )}
    </div>
  );
}
