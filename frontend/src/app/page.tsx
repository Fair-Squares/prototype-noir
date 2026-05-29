"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
  StatusChip,
} from "@/components/ui";
import { NextStepCard, type NextStep } from "@/components/overview/NextStepCard";
import { ProjectsPreview } from "@/components/overview/ProjectsPreview";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchChainParams,
  fetchFundStats,
  fetchKYCProfile,
  fetchProperties,
  formatEUR,
  formatEURDecimals,
  type ChainParams,
  type FundStats,
  type KYCProfile,
  type PropertyDeed,
} from "@/lib/contracts";

export default function OverviewPage() {
  const { activeAccount, isConnected, isConnecting, connect } = useWallet();
  const address = activeAccount?.address ?? null;

  const [stats, setStats] = useState<FundStats | null>(null);
  const [properties, setProperties] = useState<PropertyDeed[]>([]);
  const [chain, setChain] = useState<ChainParams | null>(null);
  const [kyc, setKyc] = useState<KYCProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // System-level data: fund stats, properties, chain params. Independent of wallet.
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchFundStats(), fetchProperties(), fetchChainParams()])
      .then(([nextStats, nextProps, nextChain]) => {
        if (!active) return;
        setStats(nextStats);
        setProperties(nextProps);
        setChain(nextChain);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Could not load fund overview.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Wallet-scoped KYC, used only to pick the personalized next step.
  useEffect(() => {
    if (!address) {
      setKyc(null);
      return;
    }
    let active = true;
    fetchKYCProfile(address)
      .then((profile) => {
        if (active) setKyc(profile);
      })
      .catch(() => {
        if (active) setKyc(null);
      });
    return () => {
      active = false;
    };
  }, [address]);

  const nextStep = deriveNextStep(isConnected, kyc);
  const isSimulation = stats?.source === "simulation";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Fair Squares housing fund"
        description="A private, affordable-housing investment fund on Aztec. Capital is pooled, deployed to acquire homes through member-approved proposals, and held as on-chain property deeds."
        actions={
          isConnected ? (
            <StatusChip status="verified" label={activeAccount?.alias ?? "Connected"} />
          ) : (
            <Button onClick={() => connect()} loading={isConnecting}>
              {isConnecting ? "Connecting…" : "Connect account"}
            </Button>
          )
        }
      />

      {isSimulation ? (
        <Alert tone="info" title="Simulation data">
          These figures come from the in-memory simulation, not a live chain.
        </Alert>
      ) : null}

      {stats?.isPaused ? (
        <Alert tone="warning" title="Fund is paused">
          Deposits, withdrawals, and acquisitions are temporarily halted by the
          fund administrator. Existing positions are unaffected.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Could not load overview">
          {error}
        </Alert>
      ) : null}

      {/* Headline figures */}
      <KpiGrid cols={4}>
        {loading || !stats ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : (
          <>
            <KpiCard
              label="Fund NAV"
              value={stats.navEur != null ? formatEUR(stats.navEur) : "—"}
              sub="Net asset value"
              tone="accent"
              hint="Total value of the fund: capital plus deployed assets and property deeds."
            />
            <KpiCard
              label="Available capital"
              value={formatEUR(stats.available)}
              sub="Ready to deploy"
            />
            <KpiCard
              label="Deployed in DeFi"
              value={formatEUR(stats.totalInDefi)}
              sub="Earning while parked"
              hint="Idle capital parked in DeFi yield while awaiting acquisitions."
            />
            <KpiCard
              label="Allocated to homes"
              value={formatEUR(stats.totalAllocated)}
              sub="Acquisitions"
              hint="Capital committed to property acquisitions through approved proposals."
            />
            <KpiCard
              label="Share supply"
              value={stats.totalSupply.toLocaleString()}
              sub={
                stats.navPerFsftEur != null
                  ? `${formatEURDecimals(stats.navPerFsftEur)} per share`
                  : "FSFT shares"
              }
              hint="FSFT shares outstanding. Each represents a claim on the fund's net asset value."
            />
            <KpiCard
              label="Investors"
              value={stats.investorCount.toLocaleString()}
              sub="Verified members"
            />
            <KpiCard
              label="Active projects"
              value={properties.length.toLocaleString()}
              sub="Property deeds held"
            />
          </>
        )}
      </KpiGrid>

      {/* Personalized next action */}
      <NextStepCard
        step={nextStep}
        connectAction={
          nextStep === "connect"
            ? { onConnect: () => connect(), busy: isConnecting }
            : undefined
        }
      />

      {/* Active housing projects preview */}
      <Section
        title="Active housing projects"
        description="Homes the fund has acquired through approved proposals."
        actions={
          <Link href="/fund" className="btn btn-secondary btn-sm">
            View all projects
          </Link>
        }
      >
        {loading ? (
          <SkeletonKpi className="!bg-transparent" />
        ) : (
          <ProjectsPreview properties={properties} />
        )}
      </Section>

      {/* Parameters footnote — only real chain params, no invented fields */}
      {chain ? (
        <Section title="Fund parameters" padding="tight">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <ParamRow
              label="Governance quorum"
              value={`${chain.governance.minQuorumVotes.toLocaleString()} votes`}
            />
            <ParamRow
              label="Voting window"
              value={`${chain.governance.votingWindowBlocks.toLocaleString()} blocks`}
            />
            <ParamRow
              label="Trade price band"
              value={`±${(chain.dex.priceBandBps / 100).toFixed(2)}%`}
            />
          </dl>
          <p className="text-caption mt-4 text-text-3">
            See{" "}
            <Link href="/reference" className="text-fs-teal-dark hover:underline">
              Reference
            </Link>{" "}
            for the full parameter set.
          </p>
        </Section>
      ) : null}
    </div>
  );
}

/** Map real wallet + KYC state to the single most relevant next action. */
function deriveNextStep(isConnected: boolean, kyc: KYCProfile | null): NextStep {
  if (!isConnected) return "connect";
  if (!kyc || !kyc.verified) return "verify";
  // Verified, but no position yet → prompt the first deposit.
  if (!kyc.hasDepositTicket && !kyc.hasFsftExposure) return "invest";
  return "portfolio";
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label">{label}</dt>
      <dd className="text-body mt-1 text-mono text-text-1 tabular-nums">{value}</dd>
    </div>
  );
}
