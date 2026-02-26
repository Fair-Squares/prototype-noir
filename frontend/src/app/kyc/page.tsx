"use client";

import { useEffect, useState } from "react";
import KYCFlow from "@/components/KYCFlow";
import { useWallet } from "@/contexts/WalletContext";
import { fetchKYCProfile, type KYCProfile } from "@/lib/contracts";

export default function KYCPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;

  const [profile, setProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });

  useEffect(() => {
    if (address) {
      fetchKYCProfile(address)
        .then(setProfile)
        .catch(() => setProfile({ verified: false, isInvestor: false, roles: [] }));
    } else {
      setProfile({ verified: false, isInvestor: false, roles: [] });
    }
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
        <KYCFlow
          userAddress={address}
          isVerified={profile.verified}
          isInvestor={profile.isInvestor}
          onVerified={() => setProfile({ verified: true, isInvestor: true, roles: ["investor"] })}
        />
      )}
    </div>
  );
}
