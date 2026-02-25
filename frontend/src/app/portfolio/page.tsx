"use client";

import { useEffect, useState } from "react";
import PrivateBalance from "@/components/PrivateBalance";
import WalletConnect from "@/components/WalletConnect";
import { fetchPortfolio, formatEUR, type PortfolioData } from "@/lib/contracts";

export default function PortfolioPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [topUpMsg, setTopUpMsg] = useState<string | null>(null);

  const loadPortfolio = async (addr: string) => {
    setLoading(true);
    try {
      const data = await fetchPortfolio(addr);
      setPortfolio(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (address) loadPortfolio(address);
  }, [address]);

  // Demo: call /api/fund/tokens?address= to seed EUR
  const handleTopUp = async () => {
    if (!address) return;
    await fetch(`/api/fund/tokens?address=${encodeURIComponent(address)}`);
    await loadPortfolio(address);
    setTopUpMsg("Demo EURs topped up to €50,000 ✓");
    setTimeout(() => setTopUpMsg(null), 4000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">My Account</h1>
          <p className="text-text-2 text-sm">Your EUR stablecoin wallet and housing fund position.</p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-xl bg-card p-14 text-center">
          <div className="w-14 h-14 rounded-full bg-fs-mint mx-auto mb-4 flex items-center justify-center">
            <svg className="w-7 h-7 text-fs-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
            </svg>
          </div>
          <p className="font-semibold text-text-1 text-lg mb-2">Connect your wallet</p>
          <p className="text-sm text-text-3">
            View your EURs stablecoin balance and FSFT fund position.
          </p>
        </div>
      ) : (
        <>
          <PrivateBalance portfolio={portfolio} isLoading={loading} />

          {/* Demo: top-up EUR */}
          {process.env.NEXT_PUBLIC_DEV_MODE === "true" && (
            <div className="rounded-xl bg-card p-5 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-1">Demo: Top up EURs wallet</p>
                  <p className="text-xs text-text-3 mt-0.5">
                    Get demo EURs to test the invest flow. In production, you&apos;d bridge real EUR.
                  </p>
                </div>
                <button
                  onClick={handleTopUp}
                  className="px-4 py-2 rounded-lg bg-fs-anthracite text-white text-sm font-semibold hover:bg-fs-anthracite/90 shrink-0"
                >
                  +{formatEUR(50_000)} EURs
                </button>
              </div>
              {topUpMsg && (
                <p className="text-xs text-fs-teal mt-2 font-medium">{topUpMsg}</p>
              )}
            </div>
          )}

          {/* Transaction history placeholder */}
          <div className="rounded-xl bg-card p-6">
            <h2 className="font-semibold text-text-1 mb-4">Transactions</h2>
            <div className="text-sm text-text-3 text-center py-6">
              <p>Your deposit and withdrawal history will appear here.</p>
              <p className="mt-1 text-xs">
                All transactions are provably private — amounts visible only to you.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
