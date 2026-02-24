"use client";

import { useEffect, useState } from "react";
import PrivateBalance from "@/components/PrivateBalance";
import WalletConnect from "@/components/WalletConnect";
import { fetchPortfolio, type PortfolioData } from "@/lib/contracts";

export default function PortfolioPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!address) return;
      setLoading(true);
      try {
        const data = await fetchPortfolio(address);
        setPortfolio(data);
      } catch (e) {
        console.error("Failed to load portfolio:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Portfolio</h1>
          <p className="text-text-secondary">
            Your private investment position in the housing fund.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-2xl bg-surface-card border border-surface-border p-14 text-center">
          <div className="w-12 h-12 rounded-xl bg-fs-teal/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-fs-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <p className="text-text-primary font-semibold text-lg mb-2">
            Connect your wallet to view your portfolio
          </p>
          <p className="text-sm text-text-muted">
            Your FSFT balance is private -- stored in your local PXE and only you can see it.
          </p>
        </div>
      ) : (
        <>
          <PrivateBalance portfolio={portfolio} isLoading={loading} />

          <div className="rounded-2xl bg-surface-card border border-surface-border p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-3">Transaction History</h2>
            <p className="text-sm text-text-secondary">
              Transaction history is stored in your local PXE. On-chain, only nullifiers are visible -- not amounts or addresses.
            </p>
            <div className="mt-4 bg-fs-teal/5 border border-fs-teal/10 rounded-xl p-3 text-xs text-fs-teal flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Your transaction history is truly private and cannot be reconstructed by third parties.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
