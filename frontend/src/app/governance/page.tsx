"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { votingWindowFor } from "@/lib/proposalLifecycle";
import { CouncilQueue } from "@/components/governance/CouncilQueue";
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
  fetchGovernanceEligibility,
  fetchKYCProfile,
  fetchListings,
  fetchProposals,
  registerKYC,
  type GovernanceEligibility,
  type KYCProfile,
  type Listing,
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
  const [listings, setListings] = useState<Listing[]>([]);
  const [joiningCouncil, setJoiningCouncil] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attesting, setAttesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile>({
    verified: false,
    isInvestor: false,
    roles: [],
  });
  const [standingLoaded, setStandingLoaded] = useState(false);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);

  // Monotonic token so a slow in-flight load for a previous account can never
  // overwrite the newly selected account's data (account-switch race).
  const refreshSeqRef = useRef(0);
  const refresh = async () => {
    const seq = ++refreshSeqRef.current;
    setLoading(true);
    try {
      const [next, nextListings] = await Promise.all([
        fetchProposals(address ?? undefined, accountIndex),
        fetchListings(),
      ]);
      if (seq !== refreshSeqRef.current) return;
      setProposals(next);
      setListings(nextListings);
      setLoadError(null);
    } catch (error: unknown) {
      if (seq !== refreshSeqRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Could not load proposals.");
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setStandingLoaded(false);
    if (!address) {
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      setEligibility(null);
      return;
    }
    Promise.all([fetchKYCProfile(address), fetchGovernanceEligibility(address, accountIndex)])
      .then(([profile, nextEligibility]) => {
        setKycProfile(profile);
        setEligibility(nextEligibility);
        setStandingLoaded(true);
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
      // "Open for voting" must agree with the cards: a status-0 proposal whose
      // window has lapsed displays "Voting ended", so don't count it as open.
      active: proposals.filter(
        (proposal) => proposal.status === 0 && !votingWindowFor(proposal).closed
      ).length,
      passed: proposals.filter((proposal) => proposal.status === 1).length,
      executed: proposals.filter((proposal) => proposal.status === 3).length,
    }),
    [proposals]
  );

  const canVote = Boolean(eligibility?.canVote);

  // Decision queue: actionable proposals first, newest-first within each band.
  const sortedProposals = useMemo(
    () => [...proposals].sort((a, b) => decisionRank(a) - decisionRank(b) || b.id - a.id),
    [proposals]
  );

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
    } catch (err: unknown) {
      setNotice({
        tone: "danger",
        text: err instanceof Error ? err.message : "Private check failed.",
      });
    } finally {
      setAttesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community vote"
        title="Vote on homes"
        description="You're deciding whether these homes get financed — each request shows the homes enabled, the rent terms, and the amount. Your ballot is private."
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

      {address && (kycProfile.isCouncil ?? false) ? (
        <CouncilQueue
          address={address}
          accountIndex={accountIndex}
          listings={listings}
          onReviewed={() => void refresh()}
        />
      ) : address && standingLoaded && listings.some((l) => l.status === 1) ? (
        <Section
          title="Council review queue"
          description={`${listings.filter((l) => l.status === 1).length} listing(s) await housing council review. Council membership is an admin grant; in this demo you can join instantly to walk the journey.`}
        >
          <Button
            variant="secondary"
            loading={joiningCouncil}
            onClick={async () => {
              setJoiningCouncil(true);
              try {
                await registerKYC(address, true, ["council"]);
                setKycProfile(await fetchKYCProfile(address));
              } catch (error: unknown) {
                setNotice({
                  tone: "danger",
                  text: error instanceof Error ? error.message : String(error),
                });
              } finally {
                setJoiningCouncil(false);
              }
            }}
          >
            {joiningCouncil ? "Joining…" : "Join the housing council (demo)"}
          </Button>
        </Section>
      ) : null}

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

      <Section title="Ballots">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonKpi />
            <SkeletonKpi />
          </div>
        ) : proposals.length === 0 ? (
          <EmptyState
            title="No homes up for a vote yet"
            description="Homes enter the vote from the Homes page once the council approves them. Approved, funded, and rejected ballots stay listed here."
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
