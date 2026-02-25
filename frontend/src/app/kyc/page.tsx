"use client";

import { useEffect, useState } from "react";
import KYCFlow from "@/components/KYCFlow";
import { useWallet } from "@/contexts/WalletContext";
import { fetchKYCStatus } from "@/lib/contracts";

export default function KYCPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;

  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (address) fetchKYCStatus(address).then(setIsVerified);
    else setIsVerified(false);
  }, [address]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">KYC Verification</h1>
        <p className="text-text-2 text-sm">Verify your identity privately using your passport.</p>
      </div>

      {!address ? (
        <div className="rounded-xl bg-card p-12 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <p className="font-medium text-text-1 text-lg mb-2">Connect your wallet first</p>
          <p className="text-sm text-text-3">Use the button in the top-right to connect.</p>
        </div>
      ) : (
        <KYCFlow userAddress={address} isVerified={isVerified} onVerified={() => setIsVerified(true)} />
      )}
    </div>
  );
}
