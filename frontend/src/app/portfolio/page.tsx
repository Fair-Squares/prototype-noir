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
    if (!address) return;
    setLoading(true);
    fetchPortfolio(address)
      .then(setPortfolio)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">My Account</h1>
          <p className="text-text-2 text-sm">Your position in the housing fund.</p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-xl bg-card p-14 text-center">
          <p className="font-semibold text-text-1 text-lg mb-2">Connect to see your balance</p>
          <p className="text-sm text-text-3">Your fund tokens (FSFT) represent your share of the fund.</p>
        </div>
      ) : (
        <>
          <PrivateBalance portfolio={portfolio} isLoading={loading} />

          <div className="rounded-xl bg-card p-6">
            <h2 className="font-semibold text-text-1 mb-2">Transactions</h2>
            <p className="text-sm text-text-3">
              Your deposit and withdrawal history will appear here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
