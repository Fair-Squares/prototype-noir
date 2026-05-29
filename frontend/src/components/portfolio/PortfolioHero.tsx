import { KpiCard, KpiGrid } from "@/components/ui";
import { formatEUR, type PortfolioData } from "@/lib/contracts";

export interface PortfolioHeroProps {
  portfolio: PortfolioData;
  /** Claimable protocol rewards (FSP), from rewards stats. */
  rewardsClaimable: number;
  rewardsSymbol: string;
}

/**
 * Hero metric grid — the investor's position at a glance. Reads only fields
 * present on PortfolioData (+ resolved rewards figure passed in). Total
 * position value = market value of fund shares + cash held in EUR.
 */
export function PortfolioHero({ portfolio, rewardsClaimable, rewardsSymbol }: PortfolioHeroProps) {
  const fundShareSymbol = portfolio.fundTokenSymbol ?? "FSFT";
  const cashSymbol = portfolio.eurTokenSymbol ?? "EURs";
  const fsftMarketValue = portfolio.fsftMarketValue ?? 0;
  const totalPositionValue = fsftMarketValue + portfolio.eurBalance;

  return (
    <KpiGrid cols={3}>
      <KpiCard
        label="Total position value"
        value={formatEUR(totalPositionValue)}
        sub={`Fund shares ${formatEUR(fsftMarketValue)} + cash ${formatEUR(portfolio.eurBalance)}`}
        tone="accent"
        hint="Market value of your fund shares plus cash held in your wallet."
      />
      <KpiCard
        label={`Fund shares (${fundShareSymbol})`}
        value={portfolio.balance.toLocaleString()}
        sub={
          portfolio.navPerFsftEur !== undefined
            ? `Net asset value ${formatEUR(portfolio.navPerFsftEur)} per share`
            : undefined
        }
        hint="Your fund-share token balance representing ownership in the housing fund."
      />
      <KpiCard
        label={`Cash (${cashSymbol})`}
        value={formatEUR(portfolio.eurBalance)}
        sub="Available to deposit into the fund"
      />
      <KpiCard
        label="Deposited capital"
        value={formatEUR(portfolio.depositedAmount)}
        sub="Capital you have committed to the fund"
        hint="The value of your deposit ticket in the housing fund."
      />
      <KpiCard
        label="Share of fund"
        value={`${portfolio.sharePercent.toFixed(2)}%`}
        sub="Your portion of total fund shares"
      />
      <KpiCard
        label={`Claimable rewards (${rewardsSymbol})`}
        value={rewardsClaimable.toLocaleString()}
        sub="Protocol rewards ready to claim"
        tone={rewardsClaimable > 0 ? "success" : "default"}
      />
    </KpiGrid>
  );
}
