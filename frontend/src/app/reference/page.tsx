"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  EmptyState,
  KpiCard,
  KpiGrid,
  LoadingSkeleton,
  PageHeader,
  Section,
  StatusChip,
  Tabs,
  type TabItem,
} from "@/components/ui";
import {
  fetchChainParams,
  fetchRewardsOverview,
  type ChainParams,
  type RewardsOverview,
} from "@/lib/contracts";
import { formatDuration } from "@/lib/chainParams";
import {
  ContractAddressTable,
  type ContractRow,
} from "@/components/reference/ContractAddressTable";
import { ParamTable, type ParamRow } from "@/components/reference/ParamTable";
import { ProtocolFormulas } from "@/components/reference/ProtocolFormulas";
import { RewardScheduleTable } from "@/components/reference/RewardScheduleTable";

// NEXT_PUBLIC_* values are inlined at build time, so they are readable here in
// the client bundle. An unset key resolves to "" and renders as "Not deployed"
// in the table rather than a fabricated zero address.
const CONTRACT_ROWS: ContractRow[] = [
  {
    name: "KYC Verifier",
    envKey: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS",
    address: process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "",
    role: "Private investor credentials and role checks",
  },
  {
    name: "Housing Fund",
    envKey: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS",
    address: process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "",
    role: "Private deposits, NAV accounting, distributions",
  },
  {
    name: "Fund Token (FSFT)",
    envKey: "NEXT_PUBLIC_FUND_TOKEN_ADDRESS",
    address: process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "",
    role: "Fund share token",
  },
  {
    name: "EUR Token",
    envKey: "NEXT_PUBLIC_EUR_TOKEN_ADDRESS",
    address: process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "",
    role: "Settlement currency (AIP-20)",
  },
  {
    name: "Dripper",
    envKey: "NEXT_PUBLIC_DRIPPER_ADDRESS",
    address: process.env.NEXT_PUBLIC_DRIPPER_ADDRESS ?? "",
    role: "Test-EUR faucet (test tooling only)",
  },
  {
    name: "Governance",
    envKey: "NEXT_PUBLIC_GOVERNANCE_ADDRESS",
    address: process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "",
    role: "Proposals and secret-ballot voting",
  },
  {
    name: "Property NFT",
    envKey: "NEXT_PUBLIC_PROPERTY_NFT_ADDRESS",
    address: process.env.NEXT_PUBLIC_PROPERTY_NFT_ADDRESS ?? "",
    role: "Real-estate deed NFTs (AIP-721)",
  },
  {
    name: "FSFT DEX",
    envKey: "NEXT_PUBLIC_FSFT_DEX_ADDRESS",
    address: process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "",
    role: "Private FSFT / EUR secondary market",
  },
  {
    name: "Protocol Rewards",
    envKey: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS",
    address: process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "",
    role: "FSP emission and claims",
  },
  {
    name: "Protocol Token (FSP)",
    envKey: "NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS",
    address: process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "",
    role: "Protocol reward token",
  },
];

// How many components actually resolved to an address in this build's env.
// Derived from CONTRACT_ROWS so it can never drift from the rendered table.
const resolvedContractCount = CONTRACT_ROWS.filter((r) => r.address !== "").length;

const TABS: TabItem[] = [
  { value: "chain", label: "Chain & limits" },
  { value: "contracts", label: "Contracts" },
  { value: "rewards", label: "Rewards" },
  { value: "formulas", label: "Formulas" },
];
const TAB_VALUES = new Set(TABS.map((t) => t.value));

function timingRows(p: ChainParams): ParamRow[] {
  const t = p.timing;
  return [
    { param: "L2 slot (nominal)", value: `${t.aztecSlotDurationSec}s`, note: "Protocol slot; locally automine warps across it" },
    { param: "L1 slot (nominal)", value: `${t.ethereumSlotDurationSec}s`, note: "In-process automine anvil — no fixed block time" },
    {
      param: "Epoch",
      value: `${t.epochDurationSlots} slots`,
      note: `${formatDuration(t.epochDurationSec)} nominal at ${t.aztecSlotDurationSec}s/slot`,
    },
    {
      param: "Block production",
      value: t.blockProductionMode === "on-demand" ? "On-demand (automine)" : "Steady",
      note: "Blocks advance with activity (automine), a few seconds each",
    },
    {
      param: "Single-tx inclusion",
      value: `~3-4s`,
      note: "Automine warps to the next slot; proverless locally",
    },
  ];
}

function governanceRows(p: ChainParams): ParamRow[] {
  const g = p.governance;
  const slot = p.timing.aztecSlotDurationSec;
  return [
    {
      param: "Voting window",
      value: `${g.votingWindowBlocks} blocks`,
      note: `≈ ${formatDuration(g.votingWindowSecondsEstimate)} at ${slot}s/block`,
    },
    { param: "Quorum", value: `${g.minQuorumVotes} votes`, note: "Minimum total votes for a valid result" },
    { param: "Vote weight", value: "1 / account", note: "One account, one vote — not token-weighted" },
    { param: "Pass rule", value: "quorum met & Yes > No", note: "Tallied at finalize" },
    { param: "Ballot", value: "private", note: "A nullifier prevents double-voting without revealing the voter" },
  ];
}

function dexRows(p: ChainParams): ParamRow[] {
  const d = p.dex;
  const slot = p.timing.aztecSlotDurationSec;
  return [
    {
      param: "Price band",
      value: `±${(d.priceBandBps / 100).toFixed(2)}%`,
      note: `${d.priceBandBps} bps from the reference price`,
    },
    {
      param: "Max order TTL",
      value: `${d.maxTtlBlocks} blocks`,
      note: `≈ ${formatDuration(d.maxTtlSecondsEstimate)} at ${slot}s/block`,
    },
  ];
}

function rewardsConfigRows(p: ChainParams, o: RewardsOverview): ParamRow[] {
  return [
    { param: "Distribution pool", value: `${o.token.distributionPool.toLocaleString()} ${o.token.symbol}` },
    { param: "Total supply", value: `${o.token.totalSupply.toLocaleString()} ${o.token.symbol}` },
    { param: "Schedule", value: `${o.token.years} years`, note: `${o.token.totalEpochs} epochs` },
    {
      param: "Weighting",
      value: `${o.weighting.deposit} / ${o.weighting.fsft} / ${o.weighting.governance}`,
      note: "Deposit / FSFT / governance (%)",
    },
    { param: "Current epoch", value: `${o.currentEpoch}`, note: `${o.epochsRemaining} remaining` },
    { param: "Emitted to date", value: `${o.emittedToDate.toLocaleString()} ${o.token.symbol}` },
    { param: "Total claimed", value: `${o.totalClaimed.toLocaleString()} ${o.token.symbol}` },
    { param: "Remaining pool", value: `${o.remainingPool.toLocaleString()} ${o.token.symbol}` },
    { param: "Claim minimum", value: `${p.rewards.claimMin} ${o.token.symbol}`, note: "Smallest claimable amount" },
  ];
}

function formatFreshness(at: number | null): string {
  if (at === null) return "—";
  const secondsAgo = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secondsAgo < 5) return "just now";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const m = Math.floor(secondsAgo / 60);
  return `${m}m ago`;
}

function ReferencePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam && TAB_VALUES.has(tabParam) ? tabParam : "chain";

  const [params, setParams] = useState<ChainParams | null>(null);
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Both reads are independent: chain params come from env/config (always
    // available); the rewards overview requires live mode and may legitimately
    // be unavailable. settle each on its own so one failing does not blank both.
    Promise.allSettled([fetchChainParams(), fetchRewardsOverview()]).then((results) => {
      if (cancelled) return;
      const [paramsResult, overviewResult] = results;

      if (paramsResult.status === "fulfilled") {
        setParams(paramsResult.value);
        setParamsError(null);
      } else {
        setParamsError(
          paramsResult.reason instanceof Error
            ? paramsResult.reason.message
            : "Could not load chain parameters."
        );
      }

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
        setOverviewError(null);
      } else {
        setOverview(null);
        setOverviewError(
          overviewResult.reason instanceof Error
            ? overviewResult.reason.message
            : "Could not load rewards overview."
        );
      }

      setFetchedAt(Date.now());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Source comes straight from the overview read ("live" | "simulation").
  // Fall back to "unknown" only when no overview loaded — never invent "live".
  const mode = overview?.source ?? null;
  const isSimulation = mode === "simulation";

  const onDemand = params?.timing.blockProductionMode === "on-demand";

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        {mode === "live" ? (
          <span className="chip chip-success">
            <span className="sr-only">Data source: </span>Live · local network
          </span>
        ) : isSimulation ? (
          <StatusChip status="simulation" />
        ) : null}
        <span className="text-caption text-text-3" aria-live="polite">
          Updated {loading ? "…" : formatFreshness(fetchedAt)}
        </span>
      </div>
    ),
    [mode, isSimulation, loading, fetchedAt]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Protocol reference"
        title="Parameters & transparency"
        description="Chain timing, governance and market limits, deployed contract addresses, the reward schedule, and the exact distribution, NAV, and reward formulas this network runs."
        actions={headerActions}
      />

      {paramsError ? (
        <Alert tone="danger" title="Chain parameters unavailable">
          {paramsError}
        </Alert>
      ) : null}

      {onDemand ? (
        <Alert tone="info" title="Blocks advance with activity">
          Locally the node runs an automine L1 and warps to the next slot ~2s after a transaction
          is pending, so blocks are sealed quickly as activity happens — a few seconds each, far
          faster than the nominal {params?.timing.aztecSlotDurationSec ?? 36}s slot.
          Block-denominated windows (like a voting deadline) therefore pass in seconds of real time.
        </Alert>
      ) : null}

      <Tabs tabs={TABS} value={activeTab} onValueChange={setTab} aria-label="Reference sections">
        {activeTab === "chain" ? (
          <div className="space-y-6">
            <Section title="Chain timing" description="L1/L2 block cadence and transaction inclusion.">
              {loading ? (
                <LoadingSkeleton lines={5} />
              ) : params ? (
                <ParamTable rows={timingRows(params)} caption="Chain timing parameters" />
              ) : (
                <EmptyState title="No timing data" description="Chain parameters could not be loaded." />
              )}
            </Section>

            <Section
              title="Governance & voting"
              description="Proposal voting window, quorum, and ballot rules."
            >
              {loading ? (
                <LoadingSkeleton lines={5} />
              ) : params ? (
                <ParamTable rows={governanceRows(params)} caption="Governance parameters" />
              ) : (
                <EmptyState title="No governance data" description="Chain parameters could not be loaded." />
              )}
            </Section>

            <Section
              title="Secondary market limits (FSFT / EUR)"
              description="Price band and order time-to-live on the DEX."
            >
              {loading ? (
                <LoadingSkeleton lines={2} />
              ) : params ? (
                <ParamTable rows={dexRows(params)} caption="DEX parameters" />
              ) : (
                <EmptyState title="No market data" description="Chain parameters could not be loaded." />
              )}
            </Section>
          </div>
        ) : null}

        {activeTab === "contracts" ? (
          <Section
            title="Deployed contracts"
            description="On-chain instance for each protocol component in this environment. Addresses are read from the build-time NEXT_PUBLIC_*_ADDRESS values; a component with no value set shows “Not deployed” rather than a placeholder address."
          >
            <p className="text-caption text-text-3 mb-3">
              {resolvedContractCount} of {CONTRACT_ROWS.length} components resolved to an address in this environment.
            </p>
            <ContractAddressTable rows={CONTRACT_ROWS} />
          </Section>
        ) : null}

        {activeTab === "rewards" ? (
          <div className="space-y-6">
            <Section
              title="Reward pool & weighting (FSP)"
              description="Emission configuration read from the Protocol Rewards contract."
            >
              {loading ? (
                <LoadingSkeleton lines={6} />
              ) : overview && params ? (
                <>
                  <KpiGrid cols={4} className="mb-5">
                    <KpiCard
                      label="Distribution pool"
                      value={overview.token.distributionPool.toLocaleString()}
                      sub={`${overview.token.symbol} over ${overview.token.years} years`}
                    />
                    <KpiCard
                      label="Total epochs"
                      value={overview.token.totalEpochs.toLocaleString()}
                      sub={`Epoch ${overview.currentEpoch} now`}
                    />
                    <KpiCard
                      label="Emitted to date"
                      value={overview.emittedToDate.toLocaleString()}
                      sub={`${overview.totalClaimed.toLocaleString()} claimed`}
                    />
                    <KpiCard
                      label="Weighting"
                      value={`${overview.weighting.deposit}/${overview.weighting.fsft}/${overview.weighting.governance}`}
                      sub="Deposit / FSFT / governance"
                    />
                  </KpiGrid>
                  <ParamTable rows={rewardsConfigRows(params, overview)} caption="Reward configuration" />
                </>
              ) : (
                <EmptyState
                  title="Live rewards data unavailable"
                  description={
                    overviewError
                      ? overviewError
                      : "The rewards overview requires live mode and a deployed Protocol Rewards contract."
                  }
                />
              )}
            </Section>

            <Section
              title="Emission schedule"
              description="Front-loaded yearly FSP curve from the Protocol Rewards configuration."
            >
              {loading ? (
                <LoadingSkeleton lines={6} />
              ) : overview ? (
                <RewardScheduleTable overview={overview} />
              ) : (
                <EmptyState
                  title="No schedule available"
                  description="The yearly emission curve loads with the rewards overview in live mode."
                />
              )}
            </Section>
          </div>
        ) : null}

        {activeTab === "formulas" ? (
          <Section
            title="Protocol formulas"
            description="The exact distribution, NAV, and reward calculations this network runs, as implemented in the contracts and API layer."
          >
            <ProtocolFormulas />
          </Section>
        ) : null}
      </Tabs>
    </div>
  );
}

// useSearchParams() forces a client bailout during static prerender, so the
// page that reads it must sit under a Suspense boundary (Next.js App Router).
function ReferencePageFallback() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Protocol reference"
        title="Parameters & transparency"
        description="Chain timing, governance and market limits, deployed contract addresses, the reward schedule, and the exact distribution, NAV, and reward formulas this network runs."
      />
      <LoadingSkeleton lines={6} />
    </div>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<ReferencePageFallback />}>
      <ReferencePageInner />
    </Suspense>
  );
}
