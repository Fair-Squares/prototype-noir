"use client";

import { useEffect, useState } from "react";
import KYCFlow from "@/components/KYCFlow";
import WalletConnect from "@/components/WalletConnect";
import { fetchKYCStatus } from "@/lib/contracts";

export default function KYCPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    async function load() {
      if (address) {
        const verified = await fetchKYCStatus(address);
        setIsVerified(verified);
      }
    }
    load();
  }, [address]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">KYC Verification</h1>
          <p className="text-gray-500">
            Verify your identity privately using your passport.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {!address ? (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-gray-600 font-medium text-lg mb-2">Connect your wallet first</p>
          <p className="text-sm text-gray-400">
            We need your wallet address to link your KYC verification.
          </p>
        </div>
      ) : (
        <KYCFlow
          userAddress={address}
          isVerified={isVerified}
          onVerified={() => setIsVerified(true)}
        />
      )}
    </div>
  );
}
