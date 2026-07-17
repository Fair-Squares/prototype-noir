"use client";

import Link from "next/link";
import { notFound, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { DeedTab } from "@/components/governance/DeedTab";
import { DistributionTab } from "@/components/governance/DistributionTab";
import { OverviewTab } from "@/components/governance/OverviewTab";
import { displayStatus, proposalLabel, votingWindowFor } from "@/lib/proposalLifecycle";
import { VotesTab } from "@/components/governance/VotesTab";
import {
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
  attestFsftForVoting,
  castVote,
  claimProposalDistribution,
  executeProposal,
  finalizeProposal,
  fetchGovernanceEligibility,
  fetchProposals,
  fetchProperties,
  formatEUR,
  type GovernanceEligibility,
  type Proposal,
  type PropertyDeed,
} from "@/lib/contracts";
import { hasVotedLocally, markVoted } from "@/lib/votedStore";

const TAB_VALUES = ["overview", "distribution", "deed", "votes"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return value !== null && (TAB_VALUES as readonly string[]).includes(value);
}

function ProposalDetail({ proposalId }: { proposalId: number }) {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = isTabValue(tabParam) ? tabParam : "overview";

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
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [deed, setDeed] = useState<PropertyDeed | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [voted, setVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  // Bumped only in deed-changing action success branches so the deed refetch
  // happens deliberately, not on every transient notice change.
  const [reloadVersion, setReloadVersion] = useState(0);

  const reloadProposal = useCallback(async () => {
    const proposals = await fetchProposals(address ?? undefined, accountIndex);
    const found = proposals.find((item) => item.id === proposalId) ?? null;
    setProposal(found);
    // Loaded successfully but the id doesn't exist: render not-found instead
    // of an eternal "Loading funding request…" skeleton.
    setNotFoundFlag(found === null);
  }, [address, accountIndex, proposalId]);

  useEffect(() => {
    setVoted(address ? hasVotedLocally(address, proposalId) : false);
  }, [address, proposalId]);

  // Real 404 for a syntactically valid id that has no matching proposal
  // (mirrors /fund/[id]) — never a perpetual loading skeleton.
  useEffect(() => {
    if (notFoundFlag) notFound();
  }, [notFoundFlag]);

  useEffect(() => {
    reloadProposal().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load proposal.");
    });
  }, [reloadProposal]);

  useEffect(() => {
    fetchProperties()
      .then((deeds) => setDeed(deeds.find((d) => d.proposalId === proposalId) ?? null))
      .catch(() => setDeed(null));
  }, [proposalId, reloadVersion]);

  useEffect(() => {
    if (!address) {
      setEligibility(null);
      return;
    }
    fetchGovernanceEligibility(address, accountIndex)
      .then(setEligibility)
      .catch((eligibilityError: unknown) => {
        setError(
          eligibilityError instanceof Error
            ? eligibilityError.message
            : "Could not load vote readiness."
        );
      });
  }, [address, accountIndex]);

  // §4.6 inline gate: run the one-time private eligibility check from the
  // ballot itself instead of sending the user back to the queue page.
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const handleRunCheck = async () => {
    if (!address) return;
    setIsRunningCheck(true);
    try {
      const result = await attestFsftForVoting(address, accountIndex);
      if (result.success) {
        const next = await fetchGovernanceEligibility(address, accountIndex);
        setEligibility(next);
      } else {
        setError(result.error ?? "Private eligibility check failed.");
      }
    } catch (checkError: unknown) {
      setError(
        checkError instanceof Error ? checkError.message : "Private eligibility check failed."
      );
    } finally {
      setIsRunningCheck(false);
    }
  };

  const handleVote = async (voteYes: boolean) => {
    if (!address) {
      setNotice({ tone: "danger", text: "Connect your wallet first." });
      return;
    }
    setIsVoting(true);
    setNotice(null);
    try {
      const result = await castVote(address, proposalId, voteYes, accountIndex);
      if (!result.success) {
        const text = result.error ?? "Vote failed.";
        // A duplicate-nullifier / already-voted rejection means this account has
        // in fact already voted — record it so the UI reflects that.
        if (/already voted/i.test(text)) {
          markVoted(address, proposalId);
          setVoted(true);
        }
        setNotice({ tone: "danger", text });
        return;
      }
      markVoted(address, proposalId);
      setVoted(true);
      setNotice({ tone: "success", text: `Ballot recorded (${voteYes ? "in favour" : "against"}).` });
      await reloadProposal();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Vote failed.' });
    } finally {
      setIsVoting(false);
    }
  };

  const handleFinalize = async () => {
    setIsFinalizing(true);
    setNotice(null);
    try {
      const result = await finalizeProposal(proposalId, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Finalisation failed." });
        return;
      }
      setNotice({
        tone: "success",
        text:
          proposal?.listingId != null
            ? "Voting finalised. If approved, the request joins the funding queue and funds by priority matching."
            : "Voting finalised. If approved, execute it next to open the distribution.",
      });
      setReloadVersion((v) => v + 1);
      await reloadProposal();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Finalisation failed.' });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setNotice(null);
    try {
      const result = await executeProposal(proposalId, 0, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Execution failed." });
        return;
      }
      setNotice({ tone: "success", text: "Request executed and distribution opened." });
      setReloadVersion((v) => v + 1);
      await reloadProposal();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Execution failed.' });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClaim = async () => {
    if (!address) {
      setNotice({ tone: "danger", text: "Connect your wallet first." });
      return;
    }
    setIsClaiming(true);
    setNotice(null);
    try {
      const result = await claimProposalDistribution(proposalId, address, accountIndex);
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Claim failed." });
        return;
      }
      setNotice({ tone: "success", text: "Distribution claimed." });
      setReloadVersion((v) => v + 1);
      await reloadProposal();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : 'Claim failed.' });
    } finally {
      setIsClaiming(false);
    }
  };

  const tabs: TabItem[] = [
    { value: "overview", label: "Overview" },
    { value: "distribution", label: "Payouts" },
    { value: "deed", label: "Deed" },
    { value: "votes", label: "Votes" },
  ];

  if (!proposal) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Investment committee"
          title={`Housing proposal #${proposalId}`}
          description="Loading funding request…"
          actions={
            <Link href="/governance" className="btn btn-ghost btn-sm">
              ← All requests
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
        eyebrow="Investment committee"
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
            <Link href="/governance" className="btn btn-ghost btn-sm">
              ← All requests
            </Link>
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone === "success" ? "success" : "danger"}>{notice.text}</Alert>
        ) : null}
      </div>

      {deed ? (
        <Alert tone="success" title="Home acquired">
          Property deed #{deed.tokenId} is held by the fund, valued at{" "}
          {formatEUR(deed.valuationEur)}. See the Deed tab for details.
        </Alert>
      ) : null}

      <Tabs tabs={tabs} value={activeTab} onValueChange={setTab} aria-label="Proposal details">
        {activeTab === "overview" ? (
          <OverviewTab
            proposal={proposal}
            isConnected={Boolean(address)}
            canVote={Boolean(eligibility?.canVote)}
            hasVoted={voted}
            isVoting={isVoting}
            eligibilityReason={eligibility?.reason}
            onVote={handleVote}
            onRunCheck={
              eligibility?.investorRole && !eligibility?.hasFsftVotingAttestation
                ? handleRunCheck
                : undefined
            }
            isRunningCheck={isRunningCheck}
            onFinalize={handleFinalize}
            isFinalizing={isFinalizing}
            onExecute={handleExecute}
            isExecuting={isExecuting}
            isAdmin={Boolean(activeAccount?.isAdmin)}
          />
        ) : null}
        {activeTab === "distribution" ? (
          <DistributionTab
            proposal={proposal}
            isConnected={Boolean(address)}
            isClaiming={isClaiming}
            onClaim={handleClaim}
          />
        ) : null}
        {activeTab === "deed" ? <DeedTab deed={deed} /> : null}
        {activeTab === "votes" ? <VotesTab proposal={proposal} /> : null}
      </Tabs>

      {!eligibility?.canVote && proposal.status === 0 ? (
        <p className="text-caption">
          {eligibility?.reason ?? "Complete the Fund Shares check on the Funding decisions page to vote."}{" "}
          <Link href="/governance" className="text-fs-teal hover:underline">
            Get cleared to vote
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = Number.parseInt(id, 10);

  // A non-numeric id (e.g. /governance/abc) is a 404, not a perpetual skeleton.
  if (Number.isNaN(proposalId) || proposalId < 0) {
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
      <ProposalDetail proposalId={proposalId} />
    </Suspense>
  );
}
