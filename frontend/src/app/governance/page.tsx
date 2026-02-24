"use client";

import { useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import WalletConnect from "@/components/WalletConnect";
import { fetchProposals, castVote, type Proposal } from "@/lib/contracts";

export default function GovernancePage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [voteMessage, setVoteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProposals().then(setProposals);
  }, []);

  const handleVote = async (proposalId: number, voteYes: boolean) => {
    if (!address) {
      setVoteMessage({ type: "error", text: "Connect your wallet to vote" });
      return;
    }
    setVotingId(proposalId);
    setVoteMessage(null);
    try {
      const result = await castVote(address, proposalId, voteYes);
      if (result.success) {
        setVoteMessage({
          type: "success",
          text: `✅ Vote ${voteYes ? "YES" : "NO"} cast on proposal #${proposalId} — ZK proof verified`,
        });
        // Refresh proposals to show updated tallies
        const updated = await fetchProposals();
        setProposals(updated);
      } else {
        setVoteMessage({ type: "error", text: result.error ?? "Vote failed" });
      }
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Governance</h1>
          <p className="text-gray-500">
            Vote on property acquisitions. Your vote is private — only aggregate results are public.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {/* Vote feedback */}
      {voteMessage && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            voteMessage.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}
        >
          {voteMessage.text}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🗳️</div>
          <p className="text-gray-600 font-medium text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-gray-400">
            When the housing council submits a property for acquisition, it will appear here for voting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onVote={handleVote}
              isVoting={votingId === p.id}
            />
          ))}
        </div>
      )}

      {/* Privacy notice */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-700">
        🔒 <strong>Private voting:</strong> When you cast a vote,
        it runs entirely in your local PXE. A ZK nullifier prevents double-voting without revealing
        your identity. The yes/no tallies update publicly, but nobody can see who voted which way.
      </div>
    </div>
  );
}
