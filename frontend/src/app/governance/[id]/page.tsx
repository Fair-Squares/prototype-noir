"use client";

import { use, useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import WalletConnect from "@/components/WalletConnect";
import { fetchProposals, castVote, type Proposal } from "@/lib/contracts";

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = parseInt(id);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProposals().then((proposals) => {
      const found = proposals.find((p) => p.id === proposalId);
      setProposal(found ?? null);
    });
  }, [proposalId]);

  const handleVote = async (pid: number, voteYes: boolean) => {
    if (!address) {
      setMessage({ type: "error", text: "Connect your wallet to vote" });
      return;
    }
    setIsVoting(true);
    setMessage(null);
    try {
      const result = await castVote(address, pid, voteYes);
      if (result.success) {
        setMessage({ type: "success", text: `✅ Vote cast — ZK proof verified` });
        // Refresh
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
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500">Loading proposal #{proposalId}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Proposal #{proposalId}</h1>
        <WalletConnect onConnect={setAddress} />
      </div>

      {message && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <ProposalCard proposal={proposal} onVote={handleVote} isVoting={isVoting} />

      {/* Proposal details */}
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
        <div className="space-y-4 text-sm">
          {proposal.description && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Description</p>
              <p className="text-gray-700 leading-relaxed">{proposal.description}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 font-medium mb-1">Description Hash</p>
            <code className="text-xs bg-gray-100 px-3 py-1.5 rounded-lg text-gray-600 font-mono">
              {proposal.descHash}
            </code>
          </div>
          <p className="text-xs text-gray-400">
            Full proposal details are stored on IPFS/Arweave and referenced by the hash above.
          </p>
        </div>
      </div>
    </div>
  );
}
