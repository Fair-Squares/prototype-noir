"use client";

import { KpiCard, KpiGrid } from "@/components/ui";
import { formatEUR, formatFSFT, type PortfolioData } from "@/lib/contracts";
import { formatCount } from "@/lib/format";

export interface PositionSnapshotProps {
  portfolio: PortfolioData;
}

/**
 * J6: the four-figure position snapshot — what do I have in, what is it worth,
 * what can I claim. All figures are real contract reads via /api/portfolio.
 * Shared by the journey home and the portfolio page.
 */
export function PositionSnapshot({ portfolio }: PositionSnapshotProps) {
  const shareValue = portfolio.shareValueEur ?? null;
  // Rent is euros; participation rewards are FSP tokens — never summed into
  // one euro figure (rewards are a separate program, not rental income).
  const rentClaimable = portfolio.rentClaimable ?? 0;
  const rewardsClaimable = portfolio.rewardsClaimable ?? 0;
  const rewardsSymbol = portfolio.protocolTokenSymbol ?? "FSP";

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
        sub={
          shareValue != null && portfolio.balance > 0
            ? `${formatEUR(shareValue)} at purchase price`
            : "Issued when the fund buys a home"
        }
        tone="accent"
        hint="Your FSFT balance valued at the price paid for the homes — part of your deposit, not extra money and not a market quote."
      />
      <KpiCard
        label="Rent to collect"
        value={formatEUR(rentClaimable)}
        tone={rentClaimable > 0 ? "success" : "default"}
        sub={
          rewardsClaimable > 0
            ? `Plus ${formatCount(rewardsClaimable)} ${rewardsSymbol} participation rewards`
            : rentClaimable > 0
              ? "Ready to withdraw or reinvest"
              : "Nothing waiting"
        }
        hint="Unclaimed rent earnings in euros. Participation rewards are separate tokens, not rental income. Payouts per funded home are listed on the portfolio page."
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
