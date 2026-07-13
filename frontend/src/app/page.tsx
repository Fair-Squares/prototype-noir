"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AdvancedDetails,
  Alert,
  KpiCard,
  KpiGrid,
  Section,
  SkeletonKpi,
  SkeletonRow,
} from "@/components/ui";
import {
  FundHealthKpis,
  FundParticipationKpis,
} from "@/components/overview/FundHealthKpis";
import { FundingRequestsPreview } from "@/components/overview/FundingRequestsPreview";
import { DataHealthRail } from "@/components/overview/DataHealthRail";
import {
  OverviewNextStep,
  deriveNextStep,
} from "@/components/overview/OverviewNextStep";
import { ProjectsPreview } from "@/components/overview/ProjectsPreview";
import { ImpactStrip } from "@/components/overview/ImpactStrip";
import { FeaturedProject } from "@/components/overview/FeaturedProject";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { AffordabilityProblem } from "@/components/marketing/AffordabilityProblem";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { ImpactCalculator } from "@/components/marketing/ImpactCalculator";
import { MarketingCTA } from "@/components/marketing/MarketingCTA";
import { JourneyStepper } from "@/components/journey/JourneyStepper";
import { PersonaHandOff } from "@/components/journey/PersonaHandOff";
import { PositionSnapshot } from "@/components/journey/PositionSnapshot";
import { getProjectDossier } from "@/lib/projectDossier";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchChainParams,
  fetchFundStats,
  fetchKYCProfile,
  fetchListings,
  fetchPortfolio,
  fetchProperties,
  fetchProposals,
  formatEUR,
  type ChainParams,
  type FundStats,
  type KYCProfile,
  type Listing,
  type PortfolioData,
  type PropertyDeed,
  type Proposal,
} from "@/lib/contracts";

export default function OverviewPage() {
  const { activeAccount, isConnected } = useWallet();
  const address = activeAccount?.address ?? null;

  // ── System (public) data — independent of any wallet ─────────────────────
  const [stats, setStats] = useState<FundStats | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [properties, setProperties] = useState<PropertyDeed[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
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
      fetchListings(),
      fetchChainParams(),
    ])
      .then(([nextStats, nextProposals, nextProps, nextListings, nextChain]) => {
        if (!active) return;
        setStats(nextStats);
        setProposals(nextProposals);
        setProperties(nextProps);
        setListings(nextListings);
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
    // accountIndex is required in live mode: /api/portfolio defaults to account 0
    // and rejects a mismatched address, which would null the portfolio for every
    // non-admin account and mis-derive the next step ("Make your first deposit").
    fetchPortfolio(address, activeAccount?.index)
      .then((data) => {
        if (active) setPortfolio(data);
      })
      .catch(() => {
        if (active) setPortfolio(null);
      });
    return () => {
      active = false;
    };
  }, [address, activeAccount?.index]);

  const nextStep = deriveNextStep(isConnected, kyc, portfolio);
  const isSimulation = stats != null && stats.source !== "live";
  const liveRequests = proposals.filter((p) => p.status === 0).length;

  // The one featured project (the seeded Maashaven dossier). Resolves by
  // proposal id / title-slug; null until proposals load or if none is authored.
  const featured = proposals.find((p) => getProjectDossier(p) !== null) ?? null;
  const featuredDossier = featured ? getProjectDossier(featured) : null;

  return (
    <div className="space-y-8">
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

      {/* LEAD — connected: the investor's position + single next action;
          disconnected: the housing mission in one sentence. */}
      {isConnected ? (
        <>
          <header className="max-w-2xl">
            <p className="text-label mb-1.5">Your journey</p>
            <h1 className="text-display text-text-1">
              {activeAccount?.alias ? `Welcome back, ${activeAccount.alias}` : "Welcome back"}
            </h1>
            <p className="text-body mt-2 text-text-2">
              The five steps of the journey, your live position, and the single
              next action — the full fund picture follows below.
            </p>
          </header>
          {/* S9: first-run hand-off — one question, three paths. Hidden as
              soon as the account shows any position or role. */}
          <PersonaHandOff
            hasSignal={Boolean(
              (portfolio?.depositedAmount ?? 0) > 0 ||
                (portfolio?.balance ?? 0) > 0 ||
                kyc?.isPropertyOwner ||
                kyc?.isCouncil
            )}
          />
          {/* J5: the journey stepper — each step derived from real on-chain
              state, one deep-link action on the active step. */}
          <JourneyStepper
            kyc={kyc}
            portfolio={portfolio}
            listings={listings}
            proposals={proposals}
          />
          {/* J6: the position snapshot answers "what do I own?" right under
              "where am I?". */}
          {portfolio ? <PositionSnapshot portfolio={portfolio} /> : null}
          <OverviewNextStep step={nextStep} portfolio={portfolio} />
        </>
      ) : (
        // Disconnected lead — the mission-first marketing stack. It stays inside
        // main's max-w-6xl column (in-column, not full-bleed): hero → problem
        // (mint card) → how-it-works → impact calculator. The existing
        // FeaturedProject block below is the bridge into the live fund sections,
        // and MarketingCTA closes the disconnected page (after FeaturedProject).
        // rorBps is passed from the already-loaded `stats` (no new fetch).
        <div className="space-y-12">
          <MarketingHero
            rorBps={stats?.rorBps}
            ctaCalculatorHref="/learn#calculator"
            ctaLearnHref="/learn#how"
          />
          <AffordabilityProblem band={false} />
          <HowItWorks />
          <ImpactCalculator initialRorBps={stats?.rorBps} />
        </div>
      )}

      {/* FEATURED PROJECT — the housing-first hero (the product). For the
          disconnected visitor it is the bridge from the marketing stack into the
          live fund sections; for the investor it follows the next-step block. */}
      {!loading && featured && featuredDossier ? (
        <FeaturedProject
          proposal={featured}
          dossier={featuredDossier}
          ctaPrimary={!isConnected}
        />
      ) : null}

      {/* Three headline fund figures — all real on-chain reads. The full set
          (impact, participation, raw parameters) lives behind the disclosure. */}
      <section aria-label="Fund at a glance">
        {loading || !stats ? (
          <KpiGrid cols={3}>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </KpiGrid>
        ) : (
          <KpiGrid cols={3}>
            <KpiCard
              label="Fund value (NAV)"
              value={stats.navEur != null ? formatEUR(stats.navEur) : "—"}
              tone="accent"
              sub="Capital backing every share"
              hint="Net asset value — the pooled capital (deposit principal, and property once marked) backing every Fund Share. Rent is a separate claimable earnings stream and does not inflate NAV; no DeFi yield is included."
            />
            <KpiCard
              label="Available to deploy"
              value={formatEUR(stats.available)}
              sub={stats.available > 0 ? "Ready for new acquisitions" : "Fully committed"}
              hint="Capital in the fund not yet parked in yield or committed to a home — what new acquisitions can draw on."
            />
            <KpiCard
              label="Committed to homes"
              value={formatEUR(stats.totalAllocated)}
              sub="Acquisitions funded"
              hint="Capital committed to acquiring property through approved funding requests."
            />
          </KpiGrid>
        )}
      </section>

      {/* Live funding requests — the deal-room preview, links to Governance. */}
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

      {/* Homes the fund already owns — links to the projects deal room. */}
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

      {/* All fund metrics — impact, fund health, participation, verification,
          and raw protocol parameters. Opt-in, kept out of the calm primary flow. */}
      {stats || chain ? (
        <AdvancedDetails summary="All fund metrics">
          <div className="space-y-6">
            {!loading && !error ? <ImpactStrip proposals={proposals} /> : null}

            {stats ? (
              <div className="space-y-3">
                <FundHealthKpis stats={stats} />
                <FundParticipationKpis stats={stats} />
              </div>
            ) : null}

            <DataHealthRail stats={stats} kyc={kyc} isConnected={isConnected} />

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className="text-caption text-text-3">
              See{" "}
              <Link href="/learn#parameters" className="text-fs-teal-dark hover:underline">
                Reference
              </Link>{" "}
              for the full parameter set, contract addresses, and verifier keys.
            </p>
          </div>
        </AdvancedDetails>
      ) : null}

      {/* CLOSING CTA — disconnected only. The marketing page's final call to
          action (single magenta highlight); the connected experience ends on
          the fund sections, not a marketing CTA. */}
      {!isConnected ? <MarketingCTA /> : null}
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
