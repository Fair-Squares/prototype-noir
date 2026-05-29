import { InfoDot, KpiCard, KpiGrid } from "@/components/ui";
import { formatEUR, type PortfolioData } from "@/lib/contracts";

export interface PositionSummaryProps {
  portfolio: PortfolioData;
  /** Claimable protocol rewards, resolved from rewards stats. */
  rewardsClaimable: number;
  rewardsSymbol: string;
}

/**
 * The investor's position at a glance. Leads with a single "total position
 * value" headline (market value of fund shares + cash held), then a 4-tile
 * KpiGrid covering the most important real figures. Reads only fields present
 * on PortfolioData (+ the resolved rewards figure passed in) — no fabricated
 * covenant/return numbers.
 */
export function PositionSummary({
  portfolio,
  rewardsClaimable,
  rewardsSymbol,
}: PositionSummaryProps) {
  const fundShareSymbol = portfolio.fundTokenSymbol ?? "FSFT";
  const cashSymbol = portfolio.eurTokenSymbol ?? "EURs";
  const fsftMarketValue = portfolio.fsftMarketValue ?? 0;
  const totalPositionValue = fsftMarketValue + portfolio.eurBalance;

  return (
    <section className="surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-label">Total position value</span>
          <InfoDot
            label="What is total position value"
            content="The market value of your fund shares plus the cash held in your wallet. It is not a forecast — both figures come from current on-chain state."
          />
        </div>
        <p className="text-display text-text-1">{formatEUR(totalPositionValue)}</p>
        <p className="text-caption text-text-2">
          Fund shares {formatEUR(fsftMarketValue)} + cash {formatEUR(portfolio.eurBalance)}
        </p>
      </div>

      <KpiGrid cols={4} className="mt-5">
        <KpiCard
          label={`Fund shares (${fundShareSymbol})`}
          value={portfolio.balance.toLocaleString()}
          sub={
            fsftMarketValue > 0 ? `Worth ${formatEUR(fsftMarketValue)}` : "Ownership in the fund"
          }
          hint="Your fund-share token balance, representing your ownership in the housing fund."
        />
        <KpiCard
          label={`Cash (${cashSymbol})`}
          value={formatEUR(portfolio.eurBalance)}
          sub="Available to deposit"
        />
        <KpiCard
          label="Deposited capital"
          value={formatEUR(portfolio.depositedAmount)}
          sub="Committed to the fund"
          hint="The value of your deposit ticket held by the housing fund."
        />
        <KpiCard
          label={`Claimable rewards (${rewardsSymbol})`}
          value={rewardsClaimable.toLocaleString()}
          sub={rewardsClaimable > 0 ? "Ready to claim" : "None ready yet"}
          tone={rewardsClaimable > 0 ? "success" : "default"}
        />
      </KpiGrid>
    </section>
  );
}
