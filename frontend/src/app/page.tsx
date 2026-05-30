"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AdvancedDetails,
  Alert,
  Button,
  Section,
  SkeletonRow,
  StatusChip,
} from "@/components/ui";
import {
  FundHealthKpis,
  FundHealthKpisSkeleton,
  FundParticipationKpis,
} from "@/components/overview/FundHealthKpis";
import { FundingRequestsPreview } from "@/components/overview/FundingRequestsPreview";
import { DataHealthRail } from "@/components/overview/DataHealthRail";
import {
  OverviewNextStep,
  deriveNextStep,
} from "@/components/overview/OverviewNextStep";
import { ProjectsPreview } from "@/components/overview/ProjectsPreview";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchChainParams,
  fetchFundStats,
  fetchKYCProfile,
  fetchPortfolio,
  fetchProperties,
  fetchProposals,
  formatEUR,
  type ChainParams,
  type FundStats,
  type KYCProfile,
  type PortfolioData,
  type PropertyDeed,
  type Proposal,
} from "@/lib/contracts";

export default function OverviewPage() {
  const { activeAccount, isConnected, isConnecting, connect } = useWallet();
  const address = activeAccount?.address ?? null;

  // ── System (public) data — independent of any wallet ─────────────────────
  const [stats, setStats] = useState<FundStats | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [properties, setProperties] = useState<PropertyDeed[]>([]);
  const [chain, setChain] = useState<ChainParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Wallet-scoped (private) data — only drives the personalized next step ─
  const [kyc, setKyc] = useState<KYCProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchFundStats(),
      fetchProposals(),
      fetchProperties(),
      fetchChainParams(),
    ])
      .then(([nextStats, nextProposals, nextProps, nextChain]) => {
        if (!active) return;
        setStats(nextStats);
        setProposals(nextProposals);
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

  // KYC + portfolio are advisory here (they only choose the next-step CTA), so
  // a wallet-scoped read failure must not break the public overview.
  useEffect(() => {
    if (!address) {
      setKyc(null);
      setPortfolio(null);
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
    fetchPortfolio(address)
      .then((data) => {
        if (active) setPortfolio(data);
      })
      .catch(() => {
        if (active) setPortfolio(null);
      });
    return () => {
      active = false;
    };
  }, [address]);

  const nextStep = deriveNextStep(isConnected, kyc, portfolio);
  const isSimulation = stats != null && stats.source !== "live";
  const liveRequests = proposals.filter((p) => p.status === 0).length;

  return (
    <div className="space-y-6">
      {/* Header — housing-finance framing, no marketing hero */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-label mb-1.5">Overview</p>
          <h1 className="text-display text-text-1">Fair Squares housing fund</h1>
          <p className="text-body mt-2 text-text-2">
            A private fund that pools capital to acquire affordable homes.
            Members vote to approve each acquisition; idle capital earns yield
            while it waits, and every position is held and verified privately
            on Aztec.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {isConnected ? (
            <StatusChip status="verified" label={activeAccount?.alias ?? "Connected"} />
          ) : (
            <Button onClick={() => connect()} loading={isConnecting}>
              {isConnecting ? "Connecting…" : "Connect account"}
            </Button>
          )}
        </div>
      </header>

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

      {/* Fund health: how much capital is available vs deployed */}
      <section className="space-y-3" aria-label="Fund health">
        {loading || !stats ? (
          <FundHealthKpisSkeleton />
        ) : (
          <>
            <FundHealthKpis stats={stats} />
            <FundParticipationKpis stats={stats} />
          </>
        )}
      </section>

      {/* What is verified + how fresh the data is */}
      <DataHealthRail stats={stats} kyc={kyc} isConnected={isConnected} />

      {/* Live funding requests — the deal-room preview, links to Governance */}
      <Section
        title="Live funding requests"
        description={
          loading
            ? "Loading current requests…"
            : liveRequests > 0
              ? `${liveRequests} request${liveRequests === 1 ? "" : "s"} open for member votes.`
              : "Proposals to commit fund capital to acquire a home."
        }
        actions={
          <Link href="/governance" className="btn btn-secondary btn-sm">
            View all requests
          </Link>
        }
      >
        {loading ? (
          <div className="space-y-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (
          <FundingRequestsPreview proposals={proposals} />
        )}
      </Section>

      {/* Your next step — single primary action from real wallet/KYC/portfolio */}
      <OverviewNextStep
        step={nextStep}
        portfolio={portfolio}
        connectAction={
          nextStep === "connect"
            ? { onConnect: () => connect(), busy: isConnecting }
            : undefined
        }
      />

      {/* Homes the fund already owns — links to the projects deal room */}
      <Section
        title="Homes acquired"
        description="Property deeds the fund holds after an approved acquisition."
        actions={
          <Link href="/fund" className="btn btn-secondary btn-sm">
            View all homes
          </Link>
        }
      >
        {loading ? (
          <div className="space-y-2">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (
          <ProjectsPreview properties={properties} />
        )}
      </Section>

      {/* Raw protocol / parameter detail — opt-in, kept out of the calm flow */}
      {stats || chain ? (
        <AdvancedDetails summary="Protocol parameters & raw figures">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {stats ? (
              <>
                <RawRow label="Total deposits" value={formatEUR(stats.totalDeposits)} />
                {stats.parkedAllocationBps != null ? (
                  <RawRow
                    label="Parked allocation"
                    value={`${(stats.parkedAllocationBps / 100).toFixed(2)}%`}
                  />
                ) : null}
                {stats.tokenPriceBps != null ? (
                  <RawRow
                    label="Token price"
                    value={`${(stats.tokenPriceBps / 100).toFixed(2)}%`}
                  />
                ) : null}
                <RawRow label="Data source" value={stats.source ?? "unknown"} />
              </>
            ) : null}
            {chain ? (
              <>
                <RawRow
                  label="Governance quorum"
                  value={`${chain.governance.minQuorumVotes.toLocaleString()} votes`}
                />
                <RawRow
                  label="Voting window"
                  value={`${chain.governance.votingWindowBlocks.toLocaleString()} blocks`}
                />
                <RawRow
                  label="Trade price band"
                  value={`±${(chain.dex.priceBandBps / 100).toFixed(2)}%`}
                />
                <RawRow
                  label="Block production"
                  value={chain.timing.blockProductionMode}
                />
              </>
            ) : null}
          </dl>
          <p className="text-caption mt-4 text-text-3">
            See{" "}
            <Link href="/reference" className="text-fs-teal-dark hover:underline">
              Reference
            </Link>{" "}
            for the full parameter set, contract addresses, and verifier keys.
          </p>
        </AdvancedDetails>
      ) : null}
    </div>
  );
}

function RawRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label">{label}</dt>
      <dd className="text-body mt-1 text-mono text-text-1 tabular-nums">{value}</dd>
    </div>
  );
}
