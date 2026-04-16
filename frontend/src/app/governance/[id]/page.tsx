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
  type GovernanceEligibility,
  type Proposal,
} from "@/lib/contracts";

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = Number.parseInt(id, 10);

  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        setMessage({ type: "error", text: result.error ?? "Vote failed." });
        return;
      }

      setMessage({ type: "success", text: "Vote recorded." });
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

      <ProposalCard
        proposal={proposal}
        mode="detail"
        onVote={handleVote}
        isVoting={isVoting}
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
