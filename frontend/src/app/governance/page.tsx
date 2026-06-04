"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateProposalForm } from "@/components/governance/CreateProposalForm";
import { GovernanceMemoCard } from "@/components/governance/GovernanceMemoCard";
import {
  Alert,
  Button,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
} from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForVoting,
  createProposal,
  fetchGovernanceEligibility,
  fetchKYCProfile,
  fetchProposals,
  type GovernanceEligibility,
  type KYCProfile,
  type Proposal,
} from "@/lib/contracts";

/** Decision queue order: proposals that still need a committee action surface
 *  first (open voting / voting-ended-awaiting-finalise, then approved-awaiting-
 *  execution), then funded, then rejected. Newest-first within each band. */
function decisionRank(p: Proposal): number {
  if (p.status === 0) return 0; // open, or voting ended awaiting finalisation
  if (p.status === 1) return 1; // approved, awaiting execution
  if (p.status === 3 || p.distributionOpened) return 2; // funded
  return 3; // rejected
}

export default function GovernancePage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile>({
    verified: false,
    isInvestor: false,
    roles: [],
  });
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await fetchProposals(address ?? undefined, accountIndex);
      setProposals(next);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Could not load proposals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!address) {
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      setEligibility(null);
      return;
    }
    Promise.all([fetchKYCProfile(address), fetchGovernanceEligibility(address, accountIndex)])
      .then(([profile, nextEligibility]) => {
        setKycProfile(profile);
        setEligibility(nextEligibility);
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error ? error.message : "Could not load your voting standing."
        );
      });
  }, [address, accountIndex]);

  const counts = useMemo(
    () => ({
      total: proposals.length,
      active: proposals.filter((proposal) => proposal.status === 0).length,
      passed: proposals.filter((proposal) => proposal.status === 1).length,
      executed: proposals.filter((proposal) => proposal.status === 3).length,
    }),
    [proposals]
  );

  const canCreate = Boolean(address && kycProfile.isInvestor);
  const canVote = Boolean(eligibility?.canVote);

  // Decision queue: actionable proposals first, newest-first within each band.
  const sortedProposals = useMemo(
    () => [...proposals].sort((a, b) => decisionRank(a) - decisionRank(b) || b.id - a.id),
    [proposals]
  );

  const handleCreate = async (input: {
    title: string;
    description: string;
    amount: number;
  }): Promise<string | null> => {
    if (!address) return "Connect your wallet first.";
    if (!canCreate) return "Investor role required to submit a funding request.";

    const result = await createProposal(
      address,
      input.title,
      input.description,
      input.amount,
      accountIndex
    );
    if (!result.success) return result.error ?? "Submission failed.";

    setNotice({ tone: "success", text: "Funding request submitted." });
    setShowCreate(false);
    await refresh();
    return null;
  };

  const handleAttestFsft = async () => {
    if (!address) {
      setNotice({ tone: "danger", text: "Connect your wallet first." });
      return;
    }
    setAttesting(true);
    try {
      const result = await attestFsftForVoting(address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Private check failed." });
        return;
      }
      setNotice({ tone: "success", text: "Private Fund Shares check completed." });
      const next = await fetchGovernanceEligibility(address, accountIndex);
      setEligibility(next);
    } finally {
      setAttesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investment committee"
        title="Funding decisions"
        description="Each request asks the fund to commit capital toward acquiring one affordable home. Review the ask, the quorum, and your voting standing, then cast a private ballot."
        actions={
          canCreate ? (
            <Button
              variant="secondary"
              onClick={() => setShowCreate((current) => !current)}
              aria-expanded={showCreate}
            >
              {showCreate ? "Close request form" : "New funding request"}
            </Button>
          ) : null
        }
      />

      {loadError ? <Alert tone="danger" title="Something went wrong">{loadError}</Alert> : null}

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone === "success" ? "success" : "danger"}>{notice.text}</Alert>
        ) : null}
      </div>

      <KpiGrid cols={4}>
        {loading ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : (
          <>
            <KpiCard label="Open for voting" value={counts.active.toLocaleString()} tone="accent" />
            <KpiCard label="Approved" value={counts.passed.toLocaleString()} />
            <KpiCard label="Funded" value={counts.executed.toLocaleString()} />
            <KpiCard
              label="Your standing"
              value={canVote ? "Cleared to vote" : "Not cleared"}
              tone={canVote ? "success" : "default"}
              sub={!canVote && address ? eligibility?.reason : undefined}
            />
          </>
        )}
      </KpiGrid>

      {address && kycProfile.isInvestor && !canVote ? (
        <Section
          title="Get cleared to vote"
          description="Voting requires a private proof that you hold Fund Shares. Running this check never reveals your balance — only that it is non-zero."
        >
          <Button onClick={handleAttestFsft} loading={attesting}>
            {attesting ? "Running private check…" : "Run private Fund Shares check"}
          </Button>
          {eligibility?.reason ? (
            <p className="text-caption mt-3">{eligibility.reason}</p>
          ) : null}
        </Section>
      ) : null}

      {showCreate ? (
        <Section
          title="New funding request"
          description="Open this to the committee for a vote. Investor role required."
        >
          <CreateProposalForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
        </Section>
      ) : null}

      <Section title="Funding requests">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonKpi />
            <SkeletonKpi />
          </div>
        ) : proposals.length === 0 ? (
          <EmptyState
            title="No funding requests yet"
            description="When the committee opens a request to acquire a home, it will appear here for review and voting."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {sortedProposals.map((proposal) => (
              <GovernanceMemoCard
                key={proposal.id}
                proposal={proposal}
                canVote={canVote}
                eligibilityReason={eligibility?.reason}
                isConnected={Boolean(address)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
