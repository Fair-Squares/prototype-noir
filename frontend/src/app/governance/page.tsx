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
          text: `Vote ${voteYes ? "YES" : "NO"} cast on proposal #${proposalId} -- ZK proof verified`,
        });
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
          <h1 className="text-2xl font-bold text-text-primary mb-2">Governance</h1>
          <p className="text-text-secondary">
            Vote on property acquisitions. Your vote is private -- only aggregate results are public.
          </p>
        </div>
        <WalletConnect onConnect={setAddress} />
      </div>

      {voteMessage && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            voteMessage.type === "success"
              ? "bg-fs-teal/10 border border-fs-teal/20 text-fs-teal"
              : "bg-fs-magenta/10 border border-fs-magenta/20 text-fs-magenta-light"
          }`}
        >
          {voteMessage.text}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="rounded-2xl bg-surface-card border border-surface-border p-14 text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
            </svg>
          </div>
          <p className="text-text-primary font-semibold text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-text-muted">
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

      {/* Privacy note */}
      <div className="bg-fs-teal/5 border border-fs-teal/10 rounded-xl p-4 text-sm text-fs-teal flex items-start gap-2">
        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <span>
          <strong>Private voting:</strong> When you cast a vote,
          it runs in your local PXE. A ZK nullifier prevents double-voting without revealing
          your identity. Tallies update publicly, but nobody can see who voted which way.
        </span>
      </div>
    </div>
  );
}
