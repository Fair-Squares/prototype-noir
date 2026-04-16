"use client";

import { useEffect, useState } from "react";
import KYCFlow from "@/components/KYCFlow";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import { fetchKYCProfile, type KYCProfile } from "@/lib/contracts";

export default function KYCPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;

  const [profile, setProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setProfile({ verified: false, isInvestor: false, roles: [] });
      setError(null);
      return;
    }

    fetchKYCProfile(address)
      .then((nextProfile) => {
        setProfile(nextProfile);
        setError(null);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load KYC status.");
      });
  }, [address]);

  return (
    <div className="space-y-6">
      <PageHero
        title="KYC"
        subtitle="Verify identity once to unlock investing and voting."
        ctaHref="/invest"
        ctaLabel="Go to Invest"
      />

      {error && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <MetricRow
        items={[
          { label: "Status", value: profile.verified ? "Verified" : "Not Verified", accent: profile.verified },
          { label: "Investor Role", value: profile.isInvestor ? "Ready" : "Pending" },
          { label: "Wallet", value: address ? "Connected" : "Not Connected" },
        ]}
      />

      {!address ? (
        <ActionPanel title="What To Do Now" subtitle="Connect Wallet">
          <p className="text-sm text-text-2">Use the top-right wallet button, then return here.</p>
        </ActionPanel>
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
