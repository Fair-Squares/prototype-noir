"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import KYCFlow from "@/components/KYCFlow";
import { EligibilityChecklist, type ChecklistItem } from "@/components/verification/EligibilityChecklist";
import {
  AdvancedDetails,
  Alert,
  Button,
  EmptyState,
  KpiCard,
  KpiGrid,
  LoadingSkeleton,
  PageHeader,
  ProofChip,
  Section,
  SkeletonKpi,
  StatusChip,
} from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchGovernanceEligibility,
  fetchKYCProfile,
  type GovernanceEligibility,
  type KYCProfile,
} from "@/lib/contracts";

const EMPTY_PROFILE: KYCProfile = { verified: false, isInvestor: false, roles: [] };

function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export default function VerificationPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [profile, setProfile] = useState<KYCProfile>(EMPTY_PROFILE);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setProfile(EMPTY_PROFILE);
      setEligibility(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextEligibility] = await Promise.all([
        fetchKYCProfile(address),
        fetchGovernanceEligibility(address, accountIndex),
      ]);
      setProfile(nextProfile);
      setEligibility(nextEligibility);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load verification status.");
    } finally {
      setLoading(false);
    }
  }, [address, accountIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Verification"
          title="Investor readiness"
          description="Verify your identity once to unlock investing in housing proposals and voting on the fund. Connect a wallet to see where you stand."
        />
        <Section>
          <EmptyState
            title="Connect a wallet to begin"
            description="Use the wallet button in the top bar, then return here to check your readiness and start verification."
          />
        </Section>
      </div>
    );
  }

  // ── Resolve readiness items from real data ──────────────────────────────────
  const verified = profile.verified;

  const checklist: ChecklistItem[] = [
    {
      label: "Identity verified",
      state: verified ? "ok" : "off",
      explanation:
        "You completed a private identity check with zkPassport. We confirm you are a real, eligible person without storing your passport details.",
      nextStep: "Start verification below — it takes a few steps and only needs to be done once.",
    },
    {
      label: "Investor role active",
      state: profile.isInvestor ? "ok" : verified ? "pending" : "off",
      explanation:
        "The investor role lets you deposit into the housing fund and back proposals. It is granted on-chain once your identity is verified.",
      nextStep: verified
        ? "The role is being set up. Refresh in a moment if it has not appeared yet."
        : "Verify your identity first; the investor role follows automatically.",
    },
    {
      label: "Fund exposure",
      state: profile.hasFsftExposure ? "ok" : "off",
      explanation:
        "You hold a stake in the housing fund (FSFT). This stake is what gives you a position in the properties the fund finances.",
      nextStep: "Deposit into a housing proposal on the Invest page to build a position.",
    },
    {
      label: "Voting eligibility",
      state: eligibility ? (eligibility.canVote ? "ok" : "blocked") : "pending",
      explanation: eligibility
        ? eligibility.reason
        : "Checking whether your stake lets you vote on fund decisions.",
      nextStep:
        eligibility && !eligibility.canVote
          ? "Build a verified fund position to qualify for voting."
          : undefined,
    },
    {
      label: "Rewards eligibility",
      state: profile.rewardsEligible ? "ok" : "off",
      explanation:
        "Eligible investors can claim protocol rewards. Eligibility tracks your standing as a verified participant in the fund.",
      nextStep: "Hold a verified fund position to become eligible for rewards.",
    },
    {
      label: "DEX access",
      state: profile.canTradeDex ? "ok" : "off",
      explanation:
        "Verified investors can place and match orders to transfer fund stakes peer-to-peer on the order book.",
      nextStep: "Complete identity verification to unlock the order book.",
    },
  ];

  // Network-level readiness — configured by the protocol operator, not something
  // the user acts on. Kept available but demoted out of the actionable checklist.
  const verifierKeysConfigured = Boolean(eligibility?.recursiveVkConfigured);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verification"
        title="Investor readiness"
        description="Verify your identity once to unlock investing in housing proposals and voting on the fund. Everything below reflects your current on-chain standing."
        actions={
          verified ? (
            <Link href="/portfolio#deposit" className="btn btn-primary">
              Go to Invest
            </Link>
          ) : null
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load verification status">
          <div className="flex flex-col gap-2">
            <span>{error}</span>
            <div>
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? "Retrying…" : "Try again"}
              </Button>
            </div>
          </div>
        </Alert>
      ) : null}

      {/* At-a-glance status */}
      <KpiGrid cols={3}>
        {loading && !eligibility ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : (
          <>
            <KpiCard
              label="Identity"
              value={verified ? "Verified" : "Not verified"}
              tone={verified ? "success" : "default"}
              sub={
                verified
                  ? "Private check complete"
                  : "Complete the steps below"
              }
            />
            <KpiCard
              label="Investor role"
              value={profile.isInvestor ? "Verified" : "Not verified"}
              tone={profile.isInvestor ? "success" : "default"}
              sub={profile.isInvestor ? "Can deposit and back proposals" : "Granted after verification"}
            />
            <KpiCard
              label="Voting"
              value={eligibility?.canVote ? "Eligible" : "Not yet"}
              tone={eligibility?.canVote ? "success" : "default"}
              sub={eligibility?.canVote ? "Can vote on fund decisions" : "Needs a verified position"}
            />
          </>
        )}
      </KpiGrid>

      {/* Readiness checklist */}
      <Section
        title="Readiness checklist"
        description="Each item below is checked against the network. Verified items are ready to use; the rest show what unlocks them."
      >
        {loading && !eligibility ? (
          <LoadingSkeleton lines={6} />
        ) : (
          <div className="space-y-4">
            <EligibilityChecklist items={checklist} />
            <AdvancedDetails summary="Protocol-level readiness">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex-shrink-0 sm:w-52">
                  <ProofChip
                    label="Verifier keys configured"
                    state={verifierKeysConfigured ? "ok" : "pending"}
                  />
                </div>
                <p className="text-caption min-w-0 flex-1 text-text-2">
                  The protocol&rsquo;s proof-verification keys are in place, so private eligibility
                  proofs can be checked on-chain. This is a network-level readiness check configured
                  by the protocol operator — no action is needed from you.
                </p>
              </div>
            </AdvancedDetails>
          </div>
        )}
      </Section>

      {/* Identity verification flow (preserves the existing zkPassport + register flow) */}
      <Section
        title="Identity verification"
        description="A one-time private check that confirms you are a real, eligible person."
        actions={
          <StatusChip
            status={verified ? "verified" : "pending"}
            label={verified ? "Verified" : "Action needed"}
          />
        }
      >
        <div aria-live="polite">
          <KYCFlow
            userAddress={address}
            isVerified={verified}
            isInvestor={profile.isInvestor}
            onVerified={() => void load()}
          />
        </div>
      </Section>

      {/* Privacy as assurance, in plain terms */}
      <Section title="How your privacy is protected">
        <ul className="flex flex-col gap-3">
          <li className="text-caption text-text-2">
            <span className="font-semibold text-text-1">Your documents stay with you.</span> The
            identity check confirms eligibility without sending your passport details to us or to
            the network.
          </li>
          <li className="text-caption text-text-2">
            <span className="font-semibold text-text-1">Your positions are private.</span> Your fund
            stake is held privately on-chain; eligibility checks rely on proofs, not on exposing how
            much you hold.
          </li>
          <li className="text-caption text-text-2">
            <span className="font-semibold text-text-1">Verified once, used everywhere.</span> After
            verification you can invest, vote, and use the order book without repeating the check.
          </li>
        </ul>
        <p className="text-caption mt-4 border-t border-border pt-3 text-text-3">
          Connected wallet:{" "}
          <span className="text-mono">{shortAddress(address)}</span>
        </p>
      </Section>
    </div>
  );
}
