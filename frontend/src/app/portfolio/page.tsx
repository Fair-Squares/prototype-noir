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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Portfolio</h1>
          <p className="text-gray-500">
            Your private investment position in the housing fund.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🔐</div>
          <p className="text-gray-600 font-medium text-lg mb-2">
            Connect your wallet to view your portfolio
          </p>
          <p className="text-sm text-gray-400">
            Your FSFT balance is private — it&apos;s stored in your local PXE and only you can see it.
          </p>
        </div>
      ) : (
        <>
          <PrivateBalance portfolio={portfolio} isLoading={loading} />

          {/* Transaction history */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Transaction History</h2>
            <p className="text-sm text-gray-500">
              Transaction history is stored in your local PXE. On-chain, only nullifiers are visible — not amounts or addresses.
            </p>
            <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-700">
              🔒 Your transaction history is truly private and cannot be reconstructed by third parties.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
