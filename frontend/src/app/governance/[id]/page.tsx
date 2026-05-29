"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  castVote,
  fetchGovernanceEligibility,
  fetchProposals,
  fetchProperties,
  formatEUR,
  type GovernanceEligibility,
  type Proposal,
  type PropertyDeed,
} from "@/lib/contracts";
import { hasVotedLocally, markVoted } from "@/lib/votedStore";

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = Number.parseInt(id, 10);

  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [deed, setDeed] = useState<PropertyDeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setVoted(address ? hasVotedLocally(address, proposalId) : false);
  }, [address, proposalId]);

  // If this proposal's asset has been acquired, a deed NFT exists for it.
  useEffect(() => {
    fetchProperties()
      .then((deeds) => setDeed(deeds.find((d) => d.proposalId === proposalId) ?? null))
      .catch(() => setDeed(null));
  }, [proposalId, message]);

  useEffect(() => {
    fetchProposals(address ?? undefined, accountIndex)
      .then((proposals) => {
        setProposal(proposals.find((item) => item.id === proposalId) ?? null);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load proposal.");
      });
  }, [proposalId, address, accountIndex]);

  useEffect(() => {
    if (!address) {
      setEligibility(null);
      return;
    }

    fetchGovernanceEligibility(address, accountIndex)
      .then(setEligibility)
      .catch((eligibilityError: unknown) => {
        setError(eligibilityError instanceof Error ? eligibilityError.message : "Could not load vote readiness.");
      });
  }, [address, accountIndex]);

  const handleVote = async (pid: number, voteYes: boolean) => {
    if (!address) {
      setMessage({ type: "error", text: "Connect your wallet first." });
      return;
    }

    setIsVoting(true);
    setMessage(null);
    try {
      const result = await castVote(address, pid, voteYes, accountIndex);
      if (!result.success) {
        const text = result.error ?? "Vote failed.";
        // A duplicate-nullifier / already-voted rejection means this account
        // has in fact already voted — record it so the UI reflects that.
        if (/already voted/i.test(text)) {
          markVoted(address, pid);
          setVoted(true);
        }
        setMessage({ type: "error", text });
        return;
      }

      markVoted(address, pid);
      setVoted(true);
      setMessage({ type: "success", text: `Vote recorded (${voteYes ? "Yes" : "No"}).` });
      const proposals = await fetchProposals(address, accountIndex);
      setProposal(proposals.find((item) => item.id === pid) ?? null);
    } finally {
      setIsVoting(false);
    }
  };

  if (!proposal) {
    return (
      <div className="space-y-6">
        <PageHero
          title={`Proposal #${proposalId}`}
          subtitle="Loading proposal details..."
          ctaHref="/governance"
          ctaLabel="Back to Vote"
          badge={false}
        />
        {error && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={`Proposal #${proposal.id}`}
        subtitle="Headline, budget, status, and your vote action."
        ctaHref="/governance"
        ctaLabel="Back to Vote"
        badge={false}
      />

      {error && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {deed && (
        <div className="rounded-lg border border-fs-teal/20 bg-fs-teal/10 px-4 py-3 text-sm text-fs-teal-dark">
          🏠 Property acquired — deed NFT <strong>#{deed.tokenId}</strong> (AIP-721) is held by the fund.
          Valuation <strong>{formatEUR(deed.valuationEur)}</strong>.{" "}
          <Link href="/fund" className="underline">View in Fund</Link>
        </div>
      )}

      <ProposalCard
        proposal={proposal}
        mode="detail"
        onVote={handleVote}
        isVoting={isVoting}
        hasVoted={voted}
        isConnected={Boolean(address)}
        canVote={Boolean(eligibility?.canVote)}
      />

      {!eligibility?.canVote && (
        <p className="text-sm text-text-3">
          {eligibility?.reason ?? "Complete voting requirements first."} See advanced checks on the{" "}
          <Link href="/explain" className="text-fs-teal hover:underline">
            Explain
          </Link>
          {" "}page.
        </p>
      )}
    </div>
  );
}
