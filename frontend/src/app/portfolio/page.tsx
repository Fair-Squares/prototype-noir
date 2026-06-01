"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Section,
  SkeletonKpi,
} from "@/components/ui";
import {
  ClaimableByProposal,
  FaucetPanel,
  HoldingsBreakdown,
  PositionSummary,
  ReadinessSummary,
  RentEarningsPanel,
  RewardsPanel,
  WithdrawPanel,
} from "@/components/portfolio";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForRewards,
  claimProposalDistribution,
  claimRent,
  claimRewards,
  fetchKYCProfile,
  fetchPortfolio,
  fetchProposals,
  fetchRewardsStats,
  reinvestRent,
  withdrawFunds,
  type KYCProfile,
  type PortfolioData,
  type Proposal,
  type RewardsStats,
} from "@/lib/contracts";

const EMPTY_KYC: KYCProfile = { verified: false, isInvestor: false, roles: [] };

export default function PortfolioPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [kyc, setKyc] = useState<KYCProfile>(EMPTY_KYC);
  const [rewards, setRewards] = useState<RewardsStats | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [claimingProposalId, setClaimingProposalId] = useState<number | null>(null);
  const [claimingRent, setClaimingRent] = useState(false);
  const [reinvestingRent, setReinvestingRent] = useState(false);

  const loadAccountData = async (addr: string) => {
    setLoading(true);
    try {
      const [nextPortfolio, nextKyc, nextRewards, nextProposals] = await Promise.all([
        fetchPortfolio(addr, accountIndex),
        fetchKYCProfile(addr),
        fetchRewardsStats(addr, accountIndex),
        fetchProposals(addr, accountIndex),
      ]);
      setPortfolio(nextPortfolio);
      setKyc(nextKyc);
      setRewards(nextRewards);
      setProposals(nextProposals);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load account data.");
      setPortfolio(null);
      setRewards(null);
      setProposals([]);
    } finally {
      setLoading(false);
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

  const claimableProposals = useMemo(
    () => proposals.filter((p) => (p.claimableAmount ?? 0) > 0 || p.hasClaimed),
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
      await loadAccountData(address);
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
        text: `Claimed ${(result.claimedAmount ?? 0).toLocaleString()} from housing proposal #${proposalId}.`,
      });
      await loadAccountData(address);
    } finally {
      setClaimingProposalId(null);
    }
  };

  const handleWithdraw = async (amount: number) => {
    if (!address) return { success: false, error: "Connect your wallet first." };
    const result = await withdrawFunds(address, amount, accountIndex);
    if (result.success) await loadAccountData(address);
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
      await loadAccountData(address);
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
      await loadAccountData(address);
    } finally {
      setReinvestingRent(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Portfolio"
        description="What you own in the housing fund, what it is worth, what is verified, and what you can do next."
        actions={
          <>
            <Link href="/invest" className="btn btn-primary">
              Invest
            </Link>
            {address && rewardsClaimable > 0 && canClaimRewards ? (
              <Button variant="secondary" onClick={handleClaimRewards} loading={claimingRewards}>
                {claimingRewards ? "Claiming…" : "Claim rewards"}
              </Button>
            ) : null}
            <Link href="/dex" className="btn btn-ghost">
              Trade shares
            </Link>
          </>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load your account">
          {error}
        </Alert>
      ) : null}

      <div aria-live="polite">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>

      {!address ? (
        <Section>
          <EmptyState
            title="Connect your wallet"
            description="Use the account button in the top bar to see your holdings, what they are worth, and what you can claim."
          />
        </Section>
      ) : loading && !portfolio ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonKpi key={i} />
          ))}
        </div>
      ) : portfolio ? (
        <>
          <PositionSummary
            portfolio={portfolio}
            rewardsClaimable={rewardsClaimable}
            rewardsSymbol={rewardsSymbol}
          />

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

          {(portfolio.balance ?? 0) > 0 || (portfolio.rentEarned ?? 0) > 0 ? (
            <RentEarningsPanel
              earned={portfolio.rentEarned ?? portfolio.estimatedYield}
              claimable={portfolio.rentClaimable ?? portfolio.estimatedYield}
              withdrawn={portfolio.rentWithdrawn ?? 0}
              reinvested={portfolio.rentReinvested ?? 0}
              claiming={claimingRent}
              reinvesting={reinvestingRent}
              reinvestAvailable={true}
              onWithdraw={handleWithdrawRent}
              onReinvest={handleReinvestRent}
            />
          ) : null}

          <RewardsPanel
            rewardsSymbol={rewardsSymbol}
            rewardsClaimable={rewardsClaimable}
            canClaim={canClaimRewards}
            nextStep={rewards?.eligibility?.nextSteps?.[0]}
            claiming={claimingRewards}
            attesting={attesting}
            onClaim={handleClaimRewards}
            onRunCheck={handleAttestRewards}
          />

          <Section
            title="Claimable by project"
            description="Distributions you can claim from housing proposals you backed."
          >
            <ClaimableByProposal
              proposals={claimableProposals}
              claimingId={claimingProposalId}
              onClaim={handleClaimProposal}
              disabled={loading}
            />
          </Section>

          <Section
            title="Withdraw capital"
            description="Move deposited capital back to your wallet."
          >
            <WithdrawPanel
              depositedAmount={portfolio.depositedAmount}
              onWithdraw={handleWithdraw}
            />
          </Section>

          <FaucetPanel
            address={address}
            accountIndex={accountIndex}
            onDripped={() => loadAccountData(address)}
          />

          <Section
            title="Transaction history"
            description="A record of your deposits, withdrawals, claims, and trades."
          >
            <EmptyState
              title="No transaction history available yet"
              description="The protocol does not yet expose a per-account event feed. Your live balances and claimable amounts above always reflect on-chain state."
            />
          </Section>
        </>
      ) : null}
    </div>
  );
}
