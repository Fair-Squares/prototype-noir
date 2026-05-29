import { KpiCard, KpiGrid, Section } from "@/components/ui";
import { formatEUR, type PortfolioData } from "@/lib/contracts";

export interface AccruedYieldProps {
  portfolio: PortfolioData;
}

/**
 * Accrued-yield panel. Reads estimatedYield (always present on PortfolioData)
 * and totalYield (fund-wide, optional). Both are values returned by the fund
 * contract — no target/cap percentage is asserted (the protocol exposes none).
 */
export function AccruedYield({ portfolio }: AccruedYieldProps) {
  return (
    <Section
      title="Accrued yield"
      description="Yield accrued on capital while it is held by the fund. These figures come from the fund contract and track distributions as properties generate income."
    >
      <KpiGrid cols={2}>
        <KpiCard
          label="Your accrued yield"
          value={formatEUR(portfolio.estimatedYield)}
          sub="Accrued against your deposited capital"
          hint="Yield accrued to your position, as reported by the fund contract."
        />
        {portfolio.totalYield !== undefined ? (
          <KpiCard
            label="Fund yield to date"
            value={formatEUR(portfolio.totalYield)}
            sub="Total yield accrued across the fund"
          />
        ) : null}
      </KpiGrid>
    </Section>
  );
}
