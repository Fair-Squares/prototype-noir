"use client";

import { useEffect, useState } from "react";
import PrivateBalance from "@/components/PrivateBalance";
import SimulationModeBadge from "@/components/SimulationModeBadge";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForRewards,
  claimRewards,
  fetchKYCProfile,
  fetchPortfolio,
  fetchRewardsStats,
  formatEUR,
  type KYCProfile,
  type PortfolioData,
  type RewardsStats,
} from "@/lib/contracts";

export default function PortfolioPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [rewards, setRewards] = useState<RewardsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [topUpMsg, setTopUpMsg] = useState<string | null>(null);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const isDevOrSimulation =
    process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
    process.env.NEXT_PUBLIC_SIMULATION === "true";

  const loadPortfolio = async (addr: string) => {
    setLoading(true);
    try {
      setPortfolio(await fetchPortfolio(addr, accountIndex));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (address) {
      loadPortfolio(address);
      fetchKYCProfile(address)
        .then(setKycProfile)
        .catch(() => setKycProfile({ verified: false, isInvestor: false, roles: [] }));
      fetchRewardsStats(address, accountIndex)
        .then(setRewards)
        .catch(() => setRewards(null));
    } else {
      setPortfolio(null);
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      setRewards(null);
    }
  }, [address, accountIndex]);

  const handleTopUp = async () => {
    if (!address) return;
    const res = await fetch("/api/fund/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, accountIndex, amount: 50_000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTopUpMsg(data?.error ? `Top up failed: ${data.error}` : "Top up failed");
      setTimeout(() => setTopUpMsg(null), 5000);
      return;
    }
    await loadPortfolio(address);
    setTopUpMsg("Demo EURs topped up to €50,000 ✓");
    setTimeout(() => setTopUpMsg(null), 4000);
  };

  const handleClaimRewards = async () => {
    if (!address) return;
    const result = await claimRewards(address, accountIndex);
    if (!result.success) {
      setRewardMsg(result.error ?? "Claim failed");
      setTimeout(() => setRewardMsg(null), 5000);
      return;
    }
    setRewardMsg(`Claimed ${(result.claimed ?? 0).toLocaleString()} ${rewards?.token.symbol ?? "FSP"} ✓`);
    setTimeout(() => setRewardMsg(null), 5000);
    await loadPortfolio(address);
    fetchRewardsStats(address, accountIndex).then(setRewards).catch(() => undefined);
  };

  const handleAttestRewards = async () => {
    if (!address) return;
    const result = await attestFsftForRewards(address, accountIndex);
    if (!result.success) {
      setRewardMsg(result.error ?? "Attestation failed");
      setTimeout(() => setRewardMsg(null), 5000);
      return;
    }
    setRewardMsg(
      result.fsftProofMode === "recursive-verified"
        ? "Private FSFT check completed with advanced verification ✓"
        : "Private FSFT check completed. Rewards eligibility updated ✓"
    );
    setTimeout(() => setRewardMsg(null), 5000);
    fetchRewardsStats(address, accountIndex).then(setRewards).catch(() => undefined);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="mb-2">
          <SimulationModeBadge />
        </div>
        <h1 className="text-2xl mb-1">My Account</h1>
        <p className="text-text-2 text-sm">Track your EURs wallet, FSFT shares, and FSP rewards in one place.</p>
        {address && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeAccount?.isAdmin && (
              <span className="rounded-full bg-fs-mint px-2.5 py-1 text-xs font-semibold text-fs-teal-dark">Admin</span>
            )}
            {kycProfile.isInvestor && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Investor</span>
            )}
          </div>
        )}
      </div>

      {!address ? (
        <div className="rounded-xl bg-card p-14 text-center border border-border">
          <div className="w-14 h-14 rounded-full bg-fs-mint mx-auto mb-4 flex items-center justify-center">
            <svg className="w-7 h-7 text-fs-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
            </svg>
          </div>
          <p className="font-semibold text-text-1 text-lg mb-2">Connect your wallet</p>
          <p className="text-sm text-text-3">Use the button in the top-right to connect.</p>
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-6">
            <PrivateBalance portfolio={portfolio} isLoading={loading} />

            <div className="rounded-xl bg-card p-6 border border-border">
              <h2 className="font-semibold text-text-1 mb-4">Transactions</h2>
              <div className="text-sm text-text-3 text-center py-6">
                <p>Your deposit and withdrawal history will appear here.</p>
                <p className="mt-1 text-xs">This list updates as you invest, withdraw, and claim.</p>
              </div>
            </div>
          </div>

          <aside className="rounded-xl bg-card p-5 border border-border xl:sticky xl:top-24 space-y-4">
            <div>
              <p className="text-xs text-text-3 uppercase tracking-wide font-medium mb-1">Quick actions</p>
              <p className="text-sm text-text-2">Top up demo EURs and continue with investing, trading, and voting.</p>
            </div>

            {isDevOrSimulation ? (
              <div className="rounded-lg bg-bg border border-border p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-text-1">Demo: Top up EURs wallet</p>
                  <p className="text-xs text-text-3 mt-0.5">Get demo EURs to test the invest flow.</p>
                </div>
                <button
                  onClick={handleTopUp}
                  className="w-full px-4 py-2 rounded-lg bg-fs-anthracite text-white text-sm font-semibold hover:bg-fs-anthracite/90"
                >
                  +{formatEUR(50_000)} EURs
                </button>
                {topUpMsg && <p className="text-xs text-fs-teal mt-2 font-medium">{topUpMsg}</p>}
              </div>
            ) : (
              <div className="rounded-lg bg-bg border border-border p-4 text-xs text-text-3">
                Demo top-up is only available in simulation mode.
              </div>
            )}

            <a
              href="/invest"
              className="w-full inline-flex items-center justify-center rounded-lg bg-fs-teal text-white text-sm font-semibold py-2.5 hover:bg-fs-teal-dark"
            >
              Go to Invest
            </a>
            <a
              href="/dex"
              className="w-full inline-flex items-center justify-center rounded-lg border border-border text-sm font-semibold py-2.5 text-text-2 hover:text-text-1 hover:bg-bg"
            >
              Trade FSFT/EUR
            </a>
            <a
              href="/governance"
              className="w-full inline-flex items-center justify-center rounded-lg border border-border text-sm font-semibold py-2.5 text-text-2 hover:text-text-1 hover:bg-bg"
            >
              Review Proposals
            </a>
            <a
              href="/rewards"
              className="w-full inline-flex items-center justify-center rounded-lg border border-border text-sm font-semibold py-2.5 text-text-2 hover:text-text-1 hover:bg-bg"
            >
              View FSP Distribution
            </a>

            <div className="rounded-lg bg-bg border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-text-1">FSP rewards</p>
              <p className="text-xs text-text-3">
                FSP is distributed monthly: 40% deposits, 40% FSFT participation, 20% voting participation.
              </p>
              <div className="rounded-md border border-border bg-white px-3 py-2 text-[11px] text-text-2">
                {rewards?.eligibility?.proofGuidance ??
                  "Private check: you can confirm FSFT ownership without revealing your private balance."}
              </div>
              <div className="text-xs text-text-2 space-y-1">
                <p>
                  Balance: <strong>{(portfolio?.protocolTokenBalance ?? 0).toLocaleString()} {rewards?.token.symbol ?? "FSP"}</strong>
                </p>
                <p>
                  Claimable: <strong>{(rewards?.claimable ?? 0).toLocaleString()} {rewards?.token.symbol ?? "FSP"}</strong>
                </p>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-white px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Deposit bucket</span>
                  <span className={rewards?.eligibility?.depositBucketEligible ? "text-fs-teal font-semibold" : "text-text-3"}>
                    {rewards?.eligibility?.depositBucketEligible ? "Eligible" : "Not eligible"}
                  </span>
                </div>
                {!rewards?.eligibility?.depositBucketEligible && (
                  <a href="/invest" className="inline-flex text-xs font-semibold text-fs-teal hover:text-fs-teal-dark">
                    Add a deposit
                  </a>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-border bg-white px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span>FSFT bucket</span>
                  <span className={rewards?.eligibility?.fsftBucketEligible ? "text-fs-teal font-semibold" : "text-text-3"}>
                    {rewards?.eligibility?.fsftBucketEligible ? "Eligible" : "Not eligible"}
                  </span>
                </div>
                <button
                  onClick={handleAttestRewards}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:bg-white disabled:opacity-50"
                  disabled={Boolean(rewards?.eligibility?.fsftBucketEligible)}
                >
                  {rewards?.eligibility?.fsftBucketEligible ? "FSFT check complete" : "Run private FSFT check"}
                </button>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-white px-3 py-2">
                <div className="text-xs text-text-2">Governance bucket</div>
                <p className="text-[11px] text-text-3">{rewards?.eligibility?.governanceBucketHint ?? "Vote to become eligible."}</p>
                <a href="/governance" className="inline-flex text-xs font-semibold text-fs-teal hover:text-fs-teal-dark">
                  Go vote
                </a>
              </div>

              <button
                onClick={handleClaimRewards}
                className="w-full rounded-md bg-fs-teal text-white px-2 py-2 text-xs font-semibold hover:bg-fs-teal-dark disabled:opacity-50"
                disabled={!rewards?.eligibility?.canClaimNow}
              >
                Claim
              </button>
              <p className="text-[11px] text-text-3">Claim minimum: {(rewards?.claimMin ?? 1).toLocaleString()} FSP.</p>
              {rewards?.eligibility?.nextSteps?.length ? (
                <p className="text-[11px] text-text-3">Next: {rewards.eligibility.nextSteps[0]}</p>
              ) : null}
              {rewardMsg && <p className="text-xs text-fs-teal font-medium">{rewardMsg}</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
