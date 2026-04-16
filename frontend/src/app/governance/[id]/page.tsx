"use client";

import { use, useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { AdvancedDetails, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import { castVote, fetchProposals, type Proposal } from "@/lib/contracts";

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = Number.parseInt(id, 10);

  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProposals(address ?? undefined, accountIndex).then((proposals) => {
      setProposal(proposals.find((item) => item.id === proposalId) ?? null);
    });
  }, [proposalId, address, accountIndex]);

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
        setMessage({ type: "error", text: result.error ?? "Vote failed" });
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
          ctaLabel="Back to Governance"
          badge={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={`Proposal #${proposalId}`}
        subtitle="Simple view with voting and key proposal information."
        ctaHref="/governance"
        ctaLabel="Back to Governance"
        badge={false}
      />

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          message.type === "success"
            ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
            : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <ProposalCard
        proposal={proposal}
        onVote={handleVote}
        isVoting={isVoting}
        userAddress={address}
      />

      <AdvancedDetails summary="Advanced proposal metadata">
        <div className="space-y-3 text-sm">
          {proposal.description && (
            <div>
              <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Description</p>
              <p className="text-text-2">{proposal.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-text-3 mb-1">Description hash</p>
            <code className="rounded-lg bg-bg px-2 py-1 text-xs font-mono text-text-2">{proposal.descHash}</code>
          </div>
        </div>
      </AdvancedDetails>
    </div>
  );
}
