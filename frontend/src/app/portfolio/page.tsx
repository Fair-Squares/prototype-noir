"use client";

import { useEffect, useState } from "react";
import PrivateBalance from "@/components/PrivateBalance";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
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
  const [error, setError] = useState<string | null>(null);
  const [topUpMsg, setTopUpMsg] = useState<string | null>(null);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);

  const isDevOrSimulation =
    process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
    process.env.NEXT_PUBLIC_SIMULATION === "true";

  const loadAccountData = async (addr: string) => {
    setLoading(true);
    try {
      const [nextPortfolio, nextProfile, nextRewards] = await Promise.all([
        fetchPortfolio(addr, accountIndex),
        fetchKYCProfile(addr),
        fetchRewardsStats(addr, accountIndex),
      ]);
      setPortfolio(nextPortfolio);
      setKycProfile(nextProfile);
      setRewards(nextRewards);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load account data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!address) {
      setPortfolio(null);
      setRewards(null);
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      return;
    }

    loadAccountData(address);
  }, [address, accountIndex]);

  const handleTopUp = async () => {
    if (!address) return;

    const res = await fetch("/api/fund/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, accountIndex, amount: 50_000 }),
    });

    const data = (await res.json()) as { error?: unknown };
    if (!res.ok) {
      setTopUpMsg(typeof data.error === "string" ? `Top up failed: ${data.error}` : "Top up failed");
      return;
    }

    await loadAccountData(address);
    setTopUpMsg("Demo EUR topped up to €50,000");
  };

  const handleClaimRewards = async () => {
    if (!address) return;

    const result = await claimRewards(address, accountIndex);
    if (!result.success) {
      setRewardMsg(result.error ?? "Claim failed");
      return;
    }

    setRewardMsg(`Claimed ${(result.claimed ?? 0).toLocaleString()} ${rewards?.token.symbol ?? "FSP"}`);
    await loadAccountData(address);
  };

  const handleAttestRewards = async () => {
    if (!address) return;

    const result = await attestFsftForRewards(address, accountIndex);
    if (!result.success) {
      setRewardMsg(result.error ?? "Private FSFT check failed");
      return;
    }

    setRewardMsg(
      result.fsftProofMode === "recursive-verified"
        ? "Private FSFT check completed with advanced verification"
        : "Private FSFT check completed"
    );
    await loadAccountData(address);
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="My Account"
        subtitle="Simple view of your wallet, fund position, and rewards."
        ctaHref="/invest"
        ctaLabel="Deposit EUR"
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!address ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-lg font-semibold mb-2">Connect your wallet</p>
          <p className="text-sm text-text-3">Use the wallet button in the top-right to continue.</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PrimaryCard
              title="Wallet EUR"
              value={formatEUR(portfolio?.eurBalance ?? 0)}
              hint="Available to deposit"
            />
            <PrimaryCard
              title="FSFT Position"
              value={(portfolio?.balance ?? 0).toLocaleString()}
              hint="Your fund share tokens"
            />
            <PrimaryCard
              title="Claimable Rewards"
              value={`${(rewards?.claimable ?? 0).toLocaleString()} ${rewards?.token.symbol ?? "FSP"}`}
              hint="Ready to claim now"
              accent
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Primary Actions</p>
              <h2 className="text-lg font-semibold mb-3">Choose one next step</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={handleClaimRewards}
                  disabled={!rewards?.eligibility?.canClaimNow}
                  className="rounded-lg bg-fs-teal px-3 py-2 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
                >
                  Claim Rewards
                </button>
                <button
                  onClick={handleAttestRewards}
                  disabled={Boolean(rewards?.eligibility?.fsftBucketEligible)}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1 disabled:opacity-50"
                >
                  Run Private FSFT Check
                </button>
                <a href="/dex" className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1">Trade on DEX</a>
                <a href="/governance" className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1">Open Governance</a>
              </div>

              {rewardMsg && (
                <p className="mt-3 rounded-lg border border-fs-teal/20 bg-fs-teal/10 px-3 py-2 text-sm text-fs-teal-dark">
                  {rewardMsg}
                </p>
              )}

              <p className="mt-3 text-xs text-text-3">
                {rewards?.eligibility?.nextSteps?.[0] ?? "Complete deposit, FSFT, and governance activity to maximize rewards."}
              </p>
            </div>

            <aside className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Status</p>
              <h2 className="text-lg font-semibold mb-3">Account readiness</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Investor role</span>
                  <span className={kycProfile.isInvestor ? "text-fs-teal font-semibold" : "text-text-2"}>
                    {kycProfile.isInvestor ? "Ready" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Deposit bucket</span>
                  <span className={rewards?.eligibility?.depositBucketEligible ? "text-fs-teal font-semibold" : "text-text-2"}>
                    {rewards?.eligibility?.depositBucketEligible ? "Eligible" : "Not yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">FSFT bucket</span>
                  <span className={rewards?.eligibility?.fsftBucketEligible ? "text-fs-teal font-semibold" : "text-text-2"}>
                    {rewards?.eligibility?.fsftBucketEligible ? "Eligible" : "Not yet"}
                  </span>
                </div>
              </div>

              {isDevOrSimulation && (
                <div className="mt-4 rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3 mb-2">Demo tools</p>
                  <button
                    onClick={handleTopUp}
                    className="w-full rounded-lg bg-fs-anthracite px-3 py-2 text-sm font-semibold text-white hover:bg-fs-anthracite/90"
                  >
                    Top Up Demo EUR (+€50,000)
                  </button>
                  {topUpMsg && <p className="mt-2 text-xs text-fs-teal-dark">{topUpMsg}</p>}
                </div>
              )}
            </aside>
          </section>

          <AdvancedDetails summary="Advanced portfolio breakdown">
            <PrivateBalance portfolio={portfolio} isLoading={loading} />
          </AdvancedDetails>
        </>
      )}
    </div>
  );
}
