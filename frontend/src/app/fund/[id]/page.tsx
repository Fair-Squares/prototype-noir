"use client";

import Link from "next/link";
import { notFound, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { ProjectDetailDistribution } from "@/components/projects/ProjectDetailDistribution";
import { ProjectDetailDossier } from "@/components/projects/ProjectDetailDossier";
import { ProjectDetailGovernance } from "@/components/projects/ProjectDetailGovernance";
import { ProjectDetailOverview } from "@/components/projects/ProjectDetailOverview";
import { ProjectDetailProofs } from "@/components/projects/ProjectDetailProofs";
import { getProjectDossier } from "@/lib/projectDossier";
import {
  displayStatus,
  proposalLabel,
  votingWindowFor,
} from "@/lib/proposalLifecycle";
import {
  AdvancedDetails,
  Alert,
  LoadingSkeleton,
  PageHeader,
  Section,
  StatusChip,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchFundStats,
  fetchGovernanceEligibility,
  fetchProperties,
  fetchProposals,
  formatEUR,
  type FundStats,
  type GovernanceEligibility,
  type Proposal,
  type PropertyDeed,
} from "@/lib/contracts";

// §4.4: 5 tabs -> 3 (+ the on-chain record demoted below the tabs). Legacy
// deep-link values map onto the merged tabs so old URLs keep working.
const TAB_VALUES = ["dossier", "funding", "payouts"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const LEGACY_TAB_ALIASES: Record<string, TabValue> = {
  overview: "funding",
  governance: "funding",
  distribution: "payouts",
};

function resolveTabParam(value: string | null): TabValue | null {
  if (value === null) return null;
  if ((TAB_VALUES as readonly string[]).includes(value)) return value as TabValue;
  return LEGACY_TAB_ALIASES[value] ?? null;
}

/**
 * Investment memo for a single housing project. The "project" data IS a
 * governance proposal — this view reframes it as a deal memo and pulls in the
 * matching on-chain property deed, fund capital context, and (when a wallet is
 * connected) the reader's own standing. Read-only: voting/claiming still happen
 * in the governance memo, which every tab links to. Real data only — fields with
 * no on-chain source are omitted, never invented.
 */
function ProjectDetail({ projectId }: { projectId: number }) {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const setTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [deed, setDeed] = useState<PropertyDeed | null>(null);
  const [fundStats, setFundStats] = useState<FundStats | null>(null);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadProposal = useCallback(async () => {
    const proposals = await fetchProposals(address ?? undefined, accountIndex);
    const match = proposals.find((item) => item.id === projectId) ?? null;
    setProposal(match);
    // A well-formed id that maps to no proposal is a genuine 404, not a
    // perpetual skeleton.
    if (!match) setNotFoundFlag(true);
  }, [address, accountIndex, projectId]);

  useEffect(() => {
    reloadProposal().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load project.");
    });
  }, [reloadProposal]);

  useEffect(() => {
    fetchProperties()
      .then((deeds) => setDeed(deeds.find((d) => d.proposalId === projectId) ?? null))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load property deed.");
      });
  }, [projectId]);

  useEffect(() => {
    fetchFundStats()
      .then(setFundStats)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load fund stats.");
      });
  }, []);

  useEffect(() => {
    if (!address) {
      setEligibility(null);
      return;
    }
    fetchGovernanceEligibility(address, accountIndex)
      .then(setEligibility)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load vote readiness.");
      });
  }, [address, accountIndex]);

  // Real 404 for a syntactically valid id that has no matching proposal.
  useEffect(() => {
    if (notFoundFlag) notFound();
  }, [notFoundFlag]);

  // A project's dossier (modelled project-finance detail) overlays the real
  // proposal. When one is on file we lead with it — housing first, mechanics
  // second — and gate sensitive rows to verified investors.
  const dossier = useMemo(() => (proposal ? getProjectDossier(proposal) : null), [proposal]);
  const defaultTab: TabValue = dossier ? "dossier" : "funding";
  const requestedTab = resolveTabParam(tabParam);
  const activeTab: TabValue =
    requestedTab && (requestedTab !== "dossier" || dossier) ? requestedTab : defaultTab;
  const canViewSensitive = Boolean(address) && Boolean(eligibility?.investorRole);

  const tabs: TabItem[] = [
    ...(dossier ? [{ value: "dossier", label: "Dossier" }] : []),
    { value: "funding", label: "Funding & votes" },
    { value: "payouts", label: "Payouts" },
  ];

  if (!proposal) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Investment memo"
          title={`Housing project #${projectId}`}
          description="Loading the project memo…"
          actions={
            <Link href="/fund" className="btn btn-ghost btn-sm">
              ← All projects
            </Link>
          }
        />
        {error ? (
          <Alert tone="danger" title="Something went wrong">
            {error}
          </Alert>
        ) : (
          <Section>
            <LoadingSkeleton lines={4} />
          </Section>
        )}
      </div>
    );
  }

  const window = votingWindowFor(proposal);
  const status = displayStatus(proposal);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investment memo"
        title={proposalLabel(proposal)}
        description={
          <>
            {formatEUR(proposal.amount)} requested to acquire one affordable home
            {proposal.status === 0 && !window.closed && !window.unknown ? (
              <> · voting ends in {window.remainingLabel}</>
            ) : null}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={status.kind} label={status.label} />
            <Link href="/fund" className="btn btn-ghost btn-sm">
              ← All projects
            </Link>
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      {deed ? (
        <Alert tone="success" title="Home acquired">
          Property deed #{deed.tokenId} is held by the fund
          {deed.valuationEur > 0 ? <> · valued at {formatEUR(deed.valuationEur)}</> : null}. See
          the Payouts tab for details.
        </Alert>
      ) : null}

      <Tabs tabs={tabs} value={activeTab} onValueChange={setTab} aria-label="Project memo">
        {activeTab === "dossier" && dossier ? (
          <ProjectDetailDossier
            proposal={proposal}
            deed={deed}
            fundStats={fundStats}
            dossier={dossier}
            canViewSensitive={canViewSensitive}
          />
        ) : null}
        {activeTab === "funding" ? (
          // Merged tab (§4.4): both components answer "how is this being
          // funded and decided" — one destination instead of two.
          <div className="space-y-6">
            <ProjectDetailOverview proposal={proposal} fundStats={fundStats} />
            <ProjectDetailGovernance
              proposal={proposal}
              eligibility={eligibility}
              isConnected={Boolean(address)}
            />
          </div>
        ) : null}
        {activeTab === "payouts" ? (
          <ProjectDetailDistribution proposal={proposal} deed={deed} />
        ) : null}
      </Tabs>

      {/* The raw on-chain record (§4.4): kept verbatim, demoted to opt-in —
          it is a sanctioned technical surface, not a primary tab. */}
      <AdvancedDetails summary="On-chain record (technical)">
        <ProjectDetailProofs proposal={proposal} deed={deed} />
      </AdvancedDetails>

      <p className="text-caption">
        Voting and claiming happen in the full governance memo.{" "}
        <Link href={`/governance/${proposal.id}`} className="text-fs-teal-dark underline underline-offset-2">
          Open the governance memo
        </Link>
        .
      </p>
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number.parseInt(id, 10);

  // A non-numeric id (e.g. /fund/abc) is a 404, not a perpetual skeleton.
  if (Number.isNaN(projectId) || projectId < 0) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <Section>
          <LoadingSkeleton lines={4} />
        </Section>
      }
    >
      <ProjectDetail projectId={projectId} />
    </Suspense>
  );
}
