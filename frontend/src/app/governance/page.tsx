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

  useEffect(() => { fetchProposals().then(setProposals); }, []);

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
        setVoteMessage({ type: "success", text: `Your vote on proposal #${proposalId} has been recorded.` });
        setProposals(await fetchProposals());
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
          <h1 className="text-2xl font-bold mb-1">Proposals</h1>
          <p className="text-text-2 text-sm">Vote on which properties the fund should acquire.</p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {voteMessage && (
        <div className={`rounded-lg p-3 text-sm font-medium ${
          voteMessage.type === "success" ? "bg-fs-teal/10 text-fs-teal" : "bg-fs-magenta/10 text-fs-magenta-light"
        }`}>
          {voteMessage.text}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="rounded-xl bg-card p-14 text-center">
          <p className="font-semibold text-text-1 text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-text-3">
            When the housing council submits a property for acquisition, it will appear here for voting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} onVote={handleVote} isVoting={votingId === p.id} />
          ))}
        </div>
      )}
    </div>
  );
}
