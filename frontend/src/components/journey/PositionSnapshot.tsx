"use client";

import { KpiCard, KpiGrid } from "@/components/ui";
import { formatEUR, formatFSFT, type PortfolioData } from "@/lib/contracts";

export interface PositionSnapshotProps {
  portfolio: PortfolioData;
}

/**
 * J6: the four-figure position snapshot — what do I have in, what is it worth,
 * what can I claim. All figures are real contract reads via /api/portfolio.
 * Shared by the journey home and the portfolio page.
 */
export function PositionSnapshot({ portfolio }: PositionSnapshotProps) {
  const shareValue =
    portfolio.fsftMarketValue ??
    (portfolio.navPerFsftEur != null ? Math.floor(portfolio.balance * portfolio.navPerFsftEur) : null);
  const claimableIncome = (portfolio.rentClaimable ?? 0) + (portfolio.rewardsClaimable ?? 0);

  return (
    <KpiGrid cols={4}>
      <KpiCard
        label="Deposited"
        value={formatEUR(portfolio.depositedAmount)}
        sub="Capital in the fund"
        hint="Your deposit principal pooled in the housing fund (public-path ticket; private deposits stay visible only to you)."
      />
      <KpiCard
        label="Fund shares"
        value={formatFSFT(portfolio.balance)}
        sub={shareValue != null ? `≈ ${formatEUR(shareValue)} at NAV` : "Awaiting NAV mark"}
        tone="accent"
        hint="Your FSFT balance valued at NAV per share — capital backing, not a market quote."
      />
      <KpiCard
        label="Claimable income"
        value={formatEUR(claimableIncome)}
        tone={claimableIncome > 0 ? "success" : "default"}
        sub={claimableIncome > 0 ? "Rent + rewards ready to claim" : "Nothing waiting"}
        hint="Unclaimed rent earnings plus claimable participation rewards. Distribution claims per funded home are listed on the portfolio page."
      />
      <KpiCard
        label="Rent earned to date"
        value={formatEUR(portfolio.rentEarned ?? portfolio.estimatedYield)}
        sub="Lifetime pro-rata rent"
        hint="Your lifetime share of covenant-capped rent collected by the fund — earned income, separate from NAV."
      />
    </KpiGrid>
  );
}
