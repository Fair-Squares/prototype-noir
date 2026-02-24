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
          <h1 className="text-2xl font-bold text-fs-anthracite mb-1">My Account</h1>
          <p className="text-gray-500">Your investment in the housing fund.</p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-xl bg-gray-50 p-14 text-center">
          <p className="font-semibold text-fs-anthracite text-lg mb-2">
            Connect to see your balance
          </p>
          <p className="text-sm text-gray-400">
            Your balance is private and only visible to you.
          </p>
        </div>
      ) : (
        <>
          <PrivateBalance portfolio={portfolio} isLoading={loading} />

          <div className="rounded-xl bg-white border border-gray-100 p-6">
            <h2 className="font-semibold text-fs-anthracite mb-2">Transaction History</h2>
            <p className="text-sm text-gray-400">
              Your transaction history is stored locally and is completely private.
              Nobody else can see your past deposits or withdrawals.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
