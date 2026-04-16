"use client";

import { useEffect, useMemo, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { AdvancedDetails, PageHero, PrimaryCard } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForVoting,
  castVote,
  claimProposalDistribution,
  createProposal,
  executeProposal,
  fetchGovernanceEligibility,
  fetchKYCProfile,
  fetchProposals,
  finalizeProposal,
  type GovernanceEligibility,
  type KYCProfile,
  type Proposal,
} from "@/lib/contracts";

export default function GovernancePage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile | null>(null);
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "" });

  const isInvestor = Boolean(kycProfile?.isInvestor);
  const canVote = Boolean(eligibility?.canVote);

  const refresh = async () => {
    const nextProposals = await fetchProposals(address ?? undefined, accountIndex);
    setProposals(nextProposals);
    setSelectedProposal((current) => {
      if (!current) return null;
      return nextProposals.find((proposal) => proposal.id === current.id) ?? null;
    });
  };

  useEffect(() => {
    refresh();
  }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!address) {
      setKycProfile(null);
      setEligibility(null);
      return;
    }

    Promise.all([fetchKYCProfile(address), fetchGovernanceEligibility(address, accountIndex)])
      .then(([profile, nextEligibility]) => {
        setKycProfile(profile);
        setEligibility(nextEligibility);
      })
      .catch((error: unknown) => {
        setKycProfile({ verified: false, isInvestor: false, roles: [] });
        setEligibility({
          investorRole: false,
          hasDepositTicket: false,
          hasFsftExposure: false,
          hasFsftVotingAttestation: false,
          canVote: false,
          reason: error instanceof Error ? error.message : "Could not load governance eligibility.",
        });
      });
  }, [address, accountIndex]);

  useEffect(() => {
    if (!selectedProposal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProposal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedProposal]);

  const counts = useMemo(() => {
    return {
      total: proposals.length,
      active: proposals.filter((proposal) => proposal.status === 0).length,
      passed: proposals.filter((proposal) => proposal.status === 1).length,
      executed: proposals.filter((proposal) => proposal.status === 3).length,
    };
  }, [proposals]);

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  const handleVote = async (proposalId: number, voteYes: boolean) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    if (!canVote) {
      notify("error", eligibility?.reason ?? "Voting requirements are not met.");
      return;
    }

    setLoading(true);
    try {
      const result = await castVote(address, proposalId, voteYes, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Vote failed");
        return;
      }
      notify("success", `Vote on proposal #${proposalId} recorded.`);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleAttestFsft = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const result = await attestFsftForVoting(address, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Private FSFT check failed");
        return;
      }

      notify(
        "success",
        result.privateFsftProofMode === "recursive-verified"
          ? "Private FSFT check completed with advanced verification."
          : "Private FSFT check completed."
      );

      const nextEligibility = await fetchGovernanceEligibility(address, accountIndex);
      setEligibility(nextEligibility);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async (proposalId: number) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      const result = await finalizeProposal(proposalId, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Finalize failed");
        return;
      }
      notify("success", "Proposal finalized.");
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (proposalId: number, amount: number) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      const result = await executeProposal(proposalId, amount, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Execute failed");
        return;
      }
      notify("success", result.message ?? "Proposal executed and distribution opened.");
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (proposalId: number) => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      const result = await claimProposalDistribution(proposalId, address, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Claim failed");
        return;
      }

      notify("success", result.claimedAmount ? `Claimed ${result.claimedAmount.toLocaleString()} FSFT.` : "Distribution claimed.");
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    if (!isInvestor) {
      notify("error", "Investor role required to create proposals.");
      return;
    }
    if (!form.title || !form.amount) {
      notify("error", "Title and amount are required.");
      return;
    }

    setCreating(true);
    try {
      const result = await createProposal(address, form.title, form.description, Number(form.amount), accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Failed to create proposal");
        return;
      }
      notify("success", `Proposal "${form.title}" created.`);
      setForm({ title: "", description: "", amount: "" });
      setShowCreate(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Governance"
        subtitle="Simple flow: review active proposals, vote, and track execution."
        ctaHref="/fund"
        ctaLabel="Back to Fund"
        rightContent={
          address && isInvestor ? (
            <button
              onClick={() => setShowCreate((current) => !current)}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1"
            >
              {showCreate ? "Hide Form" : "New Proposal"}
            </button>
          ) : undefined
        }
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PrimaryCard title="Active Proposals" value={counts.active.toLocaleString()} hint="Open for voting" />
        <PrimaryCard title="Passed" value={counts.passed.toLocaleString()} hint="Ready for execution" />
        <PrimaryCard title="Executed" value={counts.executed.toLocaleString()} hint="Distribution opened" accent />
      </section>

      {address && isInvestor && !canVote && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-text-2 mb-3">{eligibility?.reason ?? "Voting requirements are not met yet."}</p>
          <button
            type="button"
            onClick={handleAttestFsft}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1 disabled:opacity-50"
          >
            Run Private FSFT Check
          </button>
        </div>
      )}

      {showCreate && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Primary Action</p>
          <h2 className="text-lg font-semibold mb-3">Create proposal</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              required
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Amount (EUR)"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              min="1"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-fs-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-fs-magenta/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Submit Proposal"}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Proposals</p>
        <h2 className="text-lg font-semibold mb-3">Review and open details</h2>

        {proposals.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg p-8 text-center text-sm text-text-3">
            No proposals yet. Create the first one to start voting.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                showActions={false}
                onOpen={() => setSelectedProposal(proposal)}
              />
            ))}
          </div>
        )}
      </section>

      <AdvancedDetails summary="Advanced governance notes">
        <div className="space-y-2 text-xs text-text-2">
          <p>Total proposals: {counts.total}</p>
          <p>Privacy note: private FSFT checks verify eligibility without exposing private balances.</p>
        </div>
      </AdvancedDetails>

      {selectedProposal && (
        <div className="fixed inset-0 z-[60] p-4 md:p-8">
          <button
            type="button"
            aria-label="Close proposal modal"
            className="absolute inset-0 bg-fs-anthracite/40 backdrop-blur-[2px]"
            onClick={() => setSelectedProposal(null)}
          />
          <div className="relative mx-auto mt-6 max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl md:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-3 font-medium">Proposal #{selectedProposal.id}</p>
                <h2 className="text-xl text-text-1">{selectedProposal.title || `Proposal #${selectedProposal.id}`}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                className="rounded-lg border border-border px-2.5 py-1 text-sm text-text-2 hover:bg-bg hover:text-text-1"
              >
                Close
              </button>
            </div>

            {selectedProposal.description && (
              <p className="mb-4 text-sm text-text-2">{selectedProposal.description}</p>
            )}

            <ProposalCard
              proposal={selectedProposal}
              onVote={handleVote}
              onFinalize={handleFinalize}
              onExecute={handleExecute}
              onClaim={handleClaim}
              isVoting={loading}
              userAddress={address}
              isInvestor={canVote}
            />

            <div className="mt-4 rounded-lg border border-border bg-bg p-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-text-3">Description hash</p>
              <code className="break-all text-xs font-mono text-text-2">{selectedProposal.descHash}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
