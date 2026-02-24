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
      setVoteMessage({ type: "error", text: "Connect your wallet first" });
      return;
    }
    setVotingId(proposalId);
    setVoteMessage(null);
    try {
      const result = await castVote(address, proposalId, voteYes);
      if (result.success) {
        setVoteMessage({
          type: "success",
          text: `Your ${voteYes ? "yes" : "no"} vote on proposal #${proposalId} has been recorded.`,
        });
        const updated = await fetchProposals();
        setProposals(updated);
      } else {
        setVoteMessage({ type: "error", text: result.error ?? "Something went wrong" });
      }
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fs-anthracite mb-1">Proposals</h1>
          <p className="text-gray-500">
            Vote on which properties the fund should buy. Your vote is anonymous.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {voteMessage && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            voteMessage.type === "success"
              ? "bg-fs-mint text-fs-teal-dark"
              : "bg-red-50 text-red-600"
          }`}
        >
          {voteMessage.text}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-14 text-center">
          <p className="font-semibold text-fs-anthracite text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-gray-400">
            When a property is put forward for purchase, it will appear here for everyone to vote on.
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
    </div>
  );
}
