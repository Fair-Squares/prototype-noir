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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl mb-1">KYC Verification</h1>
        <p className="text-text-2 text-sm">
          Verify privately with zkPassport. Successful verification grants investor role access.
        </p>
      </div>

      {!address ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-medium text-text-1 text-lg mb-2">Connect your wallet first</p>
          <p className="text-sm text-text-3">Use the wallet button in the top-right to begin verification.</p>
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
