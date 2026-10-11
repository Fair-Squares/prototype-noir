"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedDetails,
  Alert,
  Button,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
} from "@/components/ui";
import {
  FaucetPanel,
  HoldingsBreakdown,
  PositionSummary,
  ReadinessSummary,
  ReadyToClaim,
  WithdrawPanel,
} from "@/components/portfolio";
import { DepositFlow } from "@/components/portfolio/DepositFlow";
import { DexOrdersPanel } from "@/components/portfolio/DexOrdersPanel";
import { PropertyExposure } from "@/components/portfolio/PropertyExposure";
import { ActivityLog } from "@/components/portfolio/ActivityLog";
import { useWallet } from "@/contexts/WalletContext";
import { aggregateImpact } from "@/lib/projectDossier";
import { logActivity } from "@/lib/sessionActivity";
import {
  attestFsftForRewards,
  claimProposalDistribution,
  claimRent,
  claimRewards,
  fetchKYCProfile,
  fetchPortfolio,
  fetchWithdrawableDeposits,
  formatEUR,
  formatFSFT,
  fetchProperties,
  fetchProposals,
  fetchRewardsStats,
  reinvestRent,
  withdrawFunds,
  type KYCProfile,
  type PortfolioData,
  type PropertyDeed,
  type Proposal,
  type RewardsStats,
} from "@/lib/contracts";

const EMPTY_KYC: KYCProfile = { verified: false, isInvestor: false, roles: [] };

export default function PortfolioPage() {
  const { activeAccount, connect, isConnecting } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [kyc, setKyc] = useState<KYCProfile>(EMPTY_KYC);
  const [rewards, setRewards] = useState<RewardsStats | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [properties, setProperties] = useState<PropertyDeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [claimingProposalId, setClaimingProposalId] = useState<number | null>(null);
  const [claimingRent, setClaimingRent] = useState(false);
  const [reinvestingRent, setReinvestingRent] = useState(false);

  // Monotonic token so a slow in-flight load for a previous account can never
  // overwrite the newly selected account's data (account-switch race).
  const loadSeqRef = useRef(0);
  const loadAccountData = async (addr: string) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [nextPortfolio, nextKyc, nextRewards, nextProposals, nextProperties] =
        await Promise.all([
          fetchPortfolio(addr, accountIndex),
          fetchKYCProfile(addr),
          fetchRewardsStats(addr, accountIndex),
          fetchProposals(addr, accountIndex),
          fetchProperties(),
        ]);
      if (seq !== loadSeqRef.current) return;
      setPortfolio(nextPortfolio);
      setKyc(nextKyc);
      setRewards(nextRewards);
      setProposals(nextProposals);
      setProperties(nextProperties);
      setError(null);
    } catch (loadError: unknown) {
      if (seq !== loadSeqRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load account data.");
      setPortfolio(null);
      setRewards(null);
      setProposals([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!address) {
      setPortfolio(null);
      setRewards(null);
      setProposals([]);
      setKyc(EMPTY_KYC);
      setError(null);
      return;
    }
    loadAccountData(address);
  }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const rewardsSymbol = rewards?.token.symbol ?? portfolio?.protocolTokenSymbol ?? "FSP";
  const rewardsClaimable = rewards?.claimable ?? portfolio?.rewardsClaimable ?? 0;
  const canClaimRewards = rewards?.eligibility?.canClaimNow ?? false;

  // D8: pro-rata impact attribution — real share fraction over the modelled
  // dossier impact layer (PositionSummary renders it with a ModelledChip).
  const impact = useMemo(() => {
    if (!portfolio) return undefined;
    const agg = aggregateImpact(proposals);
    return {
      sharePct:
        portfolio.totalSupply > 0
          ? (portfolio.balance / portfolio.totalSupply) * 100
          : 0,
      homesEnabled: agg.homesEnabled,
      projectsFunded: agg.projectsFunded,
    };
  }, [portfolio, proposals]);

  const claimableProposals = useMemo(
    // Private depositors show €0 in PUBLIC records but hold a real claimable
    // share (computed in-circuit at claim time) — include them whenever a
    // distribution is open so /portfolio leads with their actionable money.
    () =>
      proposals.filter(
        (p) =>
          (p.claimableAmount ?? 0) > 0 ||
          p.hasClaimed ||
          (Boolean(p.hasPrivateDeposits) && Boolean(p.distributionOpened))
      ),
    [proposals]
  );

  const handleClaimRewards = async () => {
    if (!address) return;
    setNotice(null);
    setClaimingRewards(true);
    try {
      const result = await claimRewards(address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Claim failed." });
        return;
      }
      setNotice({
        tone: "success",
        text: `Claimed ${(result.claimed ?? 0).toLocaleString()} ${rewardsSymbol}.`,
      });
      logActivity(address, "rewards-claim", `Claimed ${(result.claimed ?? 0).toLocaleString()} ${rewardsSymbol} rewards`);
      await loadAccountData(address);
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Reward claim failed.' });
    } finally {
      setClaimingRewards(false);
    }
  };

  const handleAttestRewards = async () => {
    if (!address) return;
    setNotice(null);
    setAttesting(true);
    try {
      const result = await attestFsftForRewards(address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Private fund-shares check failed." });
        return;
      }
      setNotice({ tone: "success", text: "Private fund-shares check completed." });
      await loadAccountData(address);
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Private fund-shares check failed.' });
    } finally {
      setAttesting(false);
    }
  };

  const handleClaimProposal = async (proposalId: number) => {
    if (!address) return;
    setNotice(null);
    setClaimingProposalId(proposalId);
    try {
      const result = await claimProposalDistribution(proposalId, address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Distribution claim failed." });
        return;
      }
      setNotice({
        tone: "success",
        text: `Claimed ${formatFSFT(result.claimedAmount ?? 0)} from housing proposal #${proposalId}.`,
      });
      logActivity(address, "payout-claim", `Claimed ${formatFSFT(result.claimedAmount ?? 0)} from housing proposal #${proposalId}`);
      await loadAccountData(address);
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Distribution claim failed.' });
    } finally {
      setClaimingProposalId(null);
    }
  };

  const handleWithdraw = async (amount: number) => {
    if (!address) return { success: false, error: "Connect your wallet first." };
    const result = await withdrawFunds(address, amount, accountIndex);
    if (result.success) {
      logActivity(address, "withdraw", `Withdrew a ${formatEUR(amount)} deposit`);
      await loadAccountData(address);
    }
    return result;
  };

  const handleWithdrawRent = async () => {
    if (!address) return;
    setNotice(null);
    setClaimingRent(true);
    try {
      const result = await claimRent(address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Rent withdrawal failed." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Rent withdrawn to your wallet." });
      logActivity(address, "rent-withdraw", "Withdrew rental income to wallet");
      await loadAccountData(address);
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Rent withdrawal failed.' });
    } finally {
      setClaimingRent(false);
    }
  };

  const handleReinvestRent = async () => {
    if (!address) return;
    setNotice(null);
    setReinvestingRent(true);
    try {
      const result = await reinvestRent(address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Reinvest failed." });
        return;
      }
      setNotice({ tone: "success", text: result.message ?? "Rent reinvested into the fund." });
      logActivity(address, "rent-reinvest", "Reinvested rental income into the fund");
      await loadAccountData(address);
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Reinvest failed.' });
    } finally {
      setReinvestingRent(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Portfolio"
        description="Your money: what you put in, what it's worth, what you can take out."
        actions={
          address ? (
            <>
              <Link href="#deposit" className="btn btn-secondary">
                Deposit
              </Link>
              <Link href="/dex" className="btn btn-ghost">
                Trade shares
              </Link>
            </>
          ) : null
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load your account">
          {error}
        </Alert>
      ) : null}

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      {!address ? (
        <Section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 max-w-md">
              <h2 className="text-heading text-text-1">Connect to see your portfolio</h2>
              <p className="text-caption mt-1 text-text-2">
                Once connected you&apos;ll see your position value, fund shares, rent
                earnings, participation rewards, and anything you can claim or
                withdraw — read privately from your own account.
              </p>
            </div>
            <Button
              className="flex-shrink-0"
              onClick={() => connect()}
              loading={isConnecting}
            >
              {isConnecting ? "Connecting…" : "Connect account"}
            </Button>
          </div>
          <div className="mt-5">
            <p className="text-label mb-2">What you&apos;ll see</p>
            <KpiGrid cols={4}>
              <KpiCard label="Position value" value="—" sub="Your stake, at value per share" />
              <KpiCard label="Fund shares" value="—" sub="FSFT you hold" />
              <KpiCard label="Rent earnings" value="—" sub="Claim or reinvest" />
              <KpiCard label="Rewards" value="—" sub="FSP participation" />
            </KpiGrid>
          </div>
        </Section>
      ) : loading && !portfolio ? (
        <div className="space-y-6">
          <div className="surface p-5 h-28" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonKpi key={i} />
            ))}
          </div>
        </div>
      ) : portfolio ? (
        <>
          {/* 1 · S5: ONE "Ready to claim" list — rent, home payouts, rewards. */}
          <div id="claims" className="scroll-mt-24">
            <Section
              title="Ready to claim"
              description="Everything you can collect right now — rent earnings, home payouts, and participation rewards — in one place."
            >
              <ReadyToClaim
                rentClaimable={portfolio.rentClaimable ?? portfolio.estimatedYield}
                rentEarned={portfolio.rentEarned ?? portfolio.estimatedYield}
                rentWithdrawn={portfolio.rentWithdrawn ?? 0}
                rentReinvested={portfolio.rentReinvested ?? 0}
                claimingRent={claimingRent}
                reinvestingRent={reinvestingRent}
                onClaimRent={handleWithdrawRent}
                onReinvestRent={handleReinvestRent}
                proposals={claimableProposals}
                claimingProposalId={claimingProposalId}
                onClaimProposal={handleClaimProposal}
                rewardsSymbol={rewardsSymbol}
                rewardsClaimable={rewardsClaimable}
                canClaimRewards={canClaimRewards}
                rewardsNextStep={rewards?.eligibility?.nextSteps?.[0]}
                claimingRewards={claimingRewards}
                attesting={attesting}
                onClaimRewards={handleClaimRewards}
                onRunRewardsCheck={handleAttestRewards}
                disabled={loading}
              />
            </Section>
          </div>

          {/* 2 · Total position (§3 strip: own · pays · makes possible · exit) */}
          <PositionSummary
            portfolio={portfolio}
            rewardsClaimable={rewardsClaimable}
            rewardsSymbol={rewardsSymbol}
            impact={impact}
          />

          {/* 2b · S3: deposit lives here now — Portfolio is the money hub. */}
          <div id="deposit" className="scroll-mt-24">
            <Section
              title="Add to your position"
              description="Deposit cash into the fund to help finance affordable homes. Your deposit and position stay private to your account."
            >
              <DepositFlow
                onDeposited={() => {
                  logActivity(address, "deposit", "Deposited into the fund");
                  void loadAccountData(address);
                }}
              />
            </Section>
          </div>

          {/* 3 · Holdings + readiness */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Section
              title="Holdings"
              description="Every balance the fund reports for your account, with its value where one is published."
              className="lg:col-span-2"
            >
              <HoldingsBreakdown
                portfolio={portfolio}
                rewardsClaimable={rewardsClaimable}
                rewardsSymbol={rewardsSymbol}
              />
            </Section>

            <ReadinessSummary kyc={kyc} portfolio={portfolio} />
          </div>

          {/* 3b · J6: your slice of each home the fund owns. Votes cast are
              deliberately NOT listed: ballots are secret by design (private
              nullifiers), so no per-account vote feed can exist on-chain. */}
          <Section
            title="Property exposure"
            description="Your fund share applied to each home the fund holds — weight and euro exposure per deed."
          >
            <PropertyExposure properties={properties} portfolio={portfolio} />
          </Section>

          {/* 3c · J6: DEX orders overview (self-contained; claim/cancel on /dex). */}
          <DexOrdersPanel address={address} accountIndex={accountIndex} />

          {/* 5 · Withdraw + activity */}
          <div id="withdraw" className="scroll-mt-24">
            <Section
              title="Withdraw capital"
              description="Pick a deposit to take back — each withdrawal returns one whole deposit to your wallet."
            >
              <WithdrawPanel
                fetchDeposits={() => fetchWithdrawableDeposits(address, accountIndex)}
                onWithdraw={handleWithdraw}
              />
            </Section>
          </div>

          <Section
            title="Activity"
            description="Actions you performed through this app in the current session."
          >
            <ActivityLog address={address} />
          </Section>

          {/* 6 · Demo tools — dev/test affordances, out of the everyday flow. */}
          <AdvancedDetails summary="Demo tools">
            <FaucetPanel
              address={address}
              accountIndex={accountIndex}
              onDripped={() => loadAccountData(address)}
            />
          </AdvancedDetails>
        </>
      ) : null}
    </div>
  );
}
