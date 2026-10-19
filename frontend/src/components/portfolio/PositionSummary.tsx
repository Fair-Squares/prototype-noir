import Link from "next/link";
import { InfoDot, KpiCard, KpiGrid, ModelledChip } from "@/components/ui";
import { formatEUR, type PortfolioData } from "@/lib/contracts";
import { formatCount, formatPct } from "@/lib/format";

export interface PositionImpact {
  /** The holder's share of FSFT supply, in percent (real arithmetic). */
  sharePct: number;
  /** Fund-level impact (modelled dossier layer, §3). */
  homesEnabled: number;
  projectsFunded: number;
}

export interface PositionSummaryProps {
  portfolio: PortfolioData;
  /** Claimable protocol rewards, resolved from rewards stats. */
  rewardsClaimable: number;
  rewardsSymbol: string;
  /** D8: personal impact attribution — omitted when nothing is funded yet. */
  impact?: PositionImpact;
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
  impact,
}: PositionSummaryProps) {
  const fundShareSymbol = portfolio.fundTokenSymbol ?? "FSFT";
  const cashSymbol = portfolio.eurTokenSymbol ?? "EURs";
  // Shares at purchase price (lib/shareValue.ts); null = shares held but no
  // issuance price known, so no total is quoted rather than a wrong one.
  const shareValue = portfolio.shareValueEur ?? null;
  const totalPositionValue = shareValue != null ? shareValue + portfolio.eurBalance : null;

  return (
    <section className="surface p-5">
      <div className="flex flex-col gap-1">
        {/* Labelled by its exact formula (shares + cash): "total position value"
            would overstate scope — deposited capital awaiting share issuance is
            shown separately below, not in this headline. */}
        <div className="flex items-center gap-1.5">
          <span className="text-label">Shares &amp; cash value</span>
          <InfoDot
            label="What is shares and cash value"
            content="Your fund shares at the price paid for the homes, plus the cash in your wallet. Deposited money not yet used for a home is shown separately below. It is not a forecast — all figures come from current on-chain state."
          />
        </div>
        <p className="text-display text-text-1">
          {totalPositionValue != null ? formatEUR(totalPositionValue) : "—"}
        </p>
        <p className="text-caption flex flex-wrap items-baseline gap-x-2 text-text-2">
          <span>Fund shares {shareValue != null ? formatEUR(shareValue) : "—"} at purchase price</span>
          <span>+ cash {formatEUR(portfolio.eurBalance)}</span>
        </p>
      </div>

      <KpiGrid cols={4} className="mt-5">
        <KpiCard
          label={`Fund shares (${fundShareSymbol})`}
          value={portfolio.balance.toLocaleString()}
          sub={
            shareValue != null && shareValue > 0
              ? `${formatEUR(shareValue)} at purchase price`
              : "Ownership in the fund"
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

      {/* §3 lines 3+4: what the stake makes possible (D8, modelled pro-rata
          attribution over real fund-level figures) and how to exit. */}
      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-baseline sm:justify-between">
        {impact && impact.projectsFunded > 0 ? (
          <p className="text-caption text-text-2">
            {impact.sharePct > 0 ? (
              <>
                Your stake is ~{formatPct(impact.sharePct)} of a fund that funded{" "}
                {formatCount(impact.projectsFunded)}{" "}
                {impact.projectsFunded === 1 ? "project" : "projects"} —{" "}
                {formatCount(impact.homesEnabled)} affordable homes.
              </>
            ) : (
              <>
                This fund has funded {formatCount(impact.projectsFunded)}{" "}
                {impact.projectsFunded === 1 ? "project" : "projects"} —{" "}
                {formatCount(impact.homesEnabled)} affordable homes.
              </>
            )}{" "}
            <ModelledChip label="Modelled" />
          </p>
        ) : (
          <p className="text-caption text-text-2">
            Your money helps finance affordable homes — impact figures appear
            once a funded project has a published project dossier.
          </p>
        )}
        <p className="text-caption shrink-0 text-text-2">
          Exit:{" "}
          <a href="#withdraw" className="underline underline-offset-2">
            withdraw a deposit
          </a>{" "}
          or{" "}
          <Link href="/dex" className="underline underline-offset-2">
            sell shares
          </Link>
        </p>
      </div>
    </section>
  );
}
