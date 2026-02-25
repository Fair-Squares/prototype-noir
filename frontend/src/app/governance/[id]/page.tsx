"use client";

import { use, useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { useWallet } from "@/contexts/WalletContext";
import { fetchProposals, castVote, type Proposal } from "@/lib/contracts";

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = parseInt(id);

  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProposals().then((proposals) => setProposal(proposals.find((p) => p.id === proposalId) ?? null));
  }, [proposalId]);

  const handleVote = async (pid: number, voteYes: boolean) => {
    if (!address) {
      setMessage({ type: "error", text: "Connect your wallet using the button in the top-right." });
      return;
    }
    setIsVoting(true);
    setMessage(null);
    try {
      const result = await castVote(address, pid, voteYes);
      if (result.success) {
        setMessage({ type: "success", text: "✅ Vote cast — ZK proof verified" });
        const proposals = await fetchProposals();
        setProposal(proposals.find((p) => p.id === pid) ?? null);
      } else {
        setMessage({ type: "error", text: result.error ?? "Vote failed" });
      }
    } finally {
      setIsVoting(false);
    }
  };

  if (!proposal) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl bg-card p-12 text-center">
          <p className="text-text-3">Loading proposal #{proposalId}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Proposal #{proposalId}</h1>

      {message && (
        <div className={`rounded-xl p-4 text-sm font-medium border ${
          message.type === "success"
            ? "bg-fs-teal/10 border-fs-teal/20 text-fs-teal-dark"
            : "bg-red-50 border-red-200 text-red-600"
        }`}>
          {message.text}
        </div>
      )}

      <ProposalCard proposal={proposal} onVote={handleVote} isVoting={isVoting} />

      <div className="rounded-xl bg-card p-6">
        <h2 className="text-base font-semibold mb-4">Details</h2>
        <div className="space-y-4 text-sm">
          {proposal.description && (
            <div>
              <p className="text-text-3 font-medium mb-1">Description</p>
              <p className="text-text-2 leading-relaxed">{proposal.description}</p>
            </div>
          )}
          <div>
            <p className="text-text-3 font-medium mb-1">Description Hash</p>
            <code className="text-xs bg-bg px-3 py-1.5 rounded-lg text-text-2 font-mono">{proposal.descHash}</code>
          </div>
          <p className="text-xs text-text-3">Full proposal details are stored on IPFS and referenced by hash.</p>
        </div>
      </div>
    </div>
  );
}
