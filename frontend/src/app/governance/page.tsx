"use client";

import { useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import SimulationModeBadge from "@/components/SimulationModeBadge";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchProposals,
  fetchKYCProfile,
  fetchGovernanceEligibility,
  castVote,
  createProposal,
  finalizeProposal,
  executeProposal,
  claimProposalDistribution,
  attestFsftForVoting,
  type Proposal,
  type GovernanceEligibility,
  type KYCProfile,
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
  const isInvestor = Boolean(kycProfile?.isInvestor);
  const canVote = Boolean(eligibility?.canVote);

  // Create proposal form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "" });

  const refresh = async () => {
    const nextProposals = await fetchProposals(address ?? undefined, accountIndex);
    setProposals(nextProposals);
    setSelectedProposal((current) => {
      if (!current) return null;
      return nextProposals.find((p) => p.id === current.id) ?? null;
    });
  };
  useEffect(() => { refresh(); }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!address) {
      setKycProfile(null);
      setEligibility(null);
      return;
    }
    Promise.all([
      fetchKYCProfile(address),
      fetchGovernanceEligibility(address, accountIndex),
    ])
      .then(([profile, nextEligibility]) => {
        setKycProfile(profile);
        setEligibility(nextEligibility);
      })
      .catch(() => {
        setKycProfile({ verified: false, isInvestor: false, roles: [] });
        setEligibility(null);
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

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  const handleVote = async (proposalId: number, voteYes: boolean) => {
    if (!address) { notify("error", "Connect your wallet first."); return; }
    if (!canVote) { notify("error", eligibility?.reason ?? "Voting eligibility requirements not met."); return; }
    setLoading(true);
    try {
      const result = await castVote(address, proposalId, voteYes, accountIndex);
      if (result.success) { notify("success", `Vote on #${proposalId} recorded.`); await refresh(); }
      else notify("error", result.error ?? "Vote failed");
    } finally { setLoading(false); }
  };

  const handleAttestFsft = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const result = await attestFsftForVoting(address, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Attestation failed");
      } else {
        notify("success", "Private FSFT proof generated. Voting access updated.");
        const next = await fetchGovernanceEligibility(address, accountIndex);
        setEligibility(next);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async (proposalId: number) => {
    if (!address) { notify("error", "Connect your wallet first."); return; }
    setLoading(true);
    try {
      const result = await finalizeProposal(proposalId, accountIndex);
      if (result.success) { notify("success", "Proposal finalized."); await refresh(); }
      else notify("error", result.error ?? "Finalize failed");
    } finally { setLoading(false); }
  };

  const handleExecute = async (proposalId: number, amount: number) => {
    if (!address) { notify("error", "Connect your wallet first."); return; }
    setLoading(true);
    try {
      const result = await executeProposal(proposalId, amount, accountIndex);
      if (result.success) {
        notify("success", result.message ?? "Proposal executed and distribution opened.");
        await refresh();
      } else notify("error", result.error ?? "Execute failed");
    } finally { setLoading(false); }
  };

  const handleClaim = async (proposalId: number) => {
    if (!address) { notify("error", "Connect your wallet first."); return; }
    setLoading(true);
    try {
      const result = await claimProposalDistribution(proposalId, address, accountIndex);
      if (result.success) {
        const claimed = result.claimedAmount ?? 0;
        notify("success", claimed > 0 ? `Claimed ${claimed.toLocaleString()} FSFT.` : (result.message ?? "Distribution claimed."));
        await refresh();
      } else {
        notify("error", result.error ?? "Claim failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) { notify("error", "Connect your wallet first."); return; }
    if (!isInvestor) { notify("error", "Investor role required to create proposals."); return; }
    if (!form.title || !form.amount) { notify("error", "Title and amount required."); return; }

    setCreating(true);
    try {
      const result = await createProposal(
        address,
        form.title,
        form.description,
        Number(form.amount),
        accountIndex
      );
      if (result.success) {
        notify("success", `Proposal "${form.title}" created!`);
        setForm({ title: "", description: "", amount: "" });
        setShowCreate(false);
        await refresh();
      } else {
        notify("error", result.error ?? "Failed to create proposal");
      }
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-card border border-border p-6 flex items-start justify-between">
        <div>
          <div className="mb-2">
            <SimulationModeBadge />
          </div>
          <h1 className="text-2xl font-brand-black mb-1">Proposals</h1>
          <p className="text-text-2 text-sm">Vote on property purchases. Passed proposals can be finalized and executed, then investors can claim FSFT.</p>
        </div>
        {address && isInvestor && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg bg-fs-magenta text-white text-sm font-medium hover:bg-fs-magenta/90 transition-colors"
          >
            {showCreate ? "Cancel" : "+ New Proposal"}
          </button>
        )}
      </div>

      {address && !isInvestor && (
        <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text-2">
          This account is not an investor yet. You can review proposals, but creating and voting require investor status.
        </div>
      )}
      {address && isInvestor && !canVote && (
        <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text-2 flex flex-wrap items-center justify-between gap-2">
          <span>{eligibility?.reason ?? "Voting needs investor status plus an active fund position."}</span>
          <button
            type="button"
            onClick={handleAttestFsft}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-white disabled:opacity-50"
          >
            Generate private FSFT proof
          </button>
        </div>
      )}
      {address && (
        <div className="rounded-lg border border-border bg-bg p-3 text-xs text-text-2">
          Proof note: when you generate a private FSFT proof, Aztec verifies you hold private FSFT without exposing your balance.
        </div>
      )}

      {/* Create proposal form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-fs-magenta/20 bg-card p-6 space-y-4">
          <h2 className="font-semibold text-text-1">New property proposal</h2>
          <div>
            <label className="block text-sm text-text-2 mb-1">Title</label>
            <input
              type="text"
              placeholder="e.g. Acquisition of 3 flats in Amsterdam Noord"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-1 focus:ring-fs-magenta"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-2 mb-1">Description</label>
            <textarea
              placeholder="Property details, location, expected yield…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-1 focus:ring-fs-magenta resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-text-2 mb-1">Amount (EUR)</label>
            <input
              type="number"
              placeholder="e.g. 150000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              min="1"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-1 focus:ring-fs-magenta"
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded-lg bg-fs-magenta text-white text-sm font-medium hover:bg-fs-magenta/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Submit Proposal"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2 rounded-lg border border-border text-sm text-text-2 hover:text-text-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Status message */}
      {message && (
        <div className={`rounded-lg p-3 text-sm font-medium ${
          message.type === "success"
            ? "bg-fs-teal/10 text-fs-teal-dark border border-fs-teal/20"
            : "bg-red-50 text-red-600 border border-red-100"
        }`}>
          {message.text}
        </div>
      )}

      {/* Proposals list */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
      {proposals.length === 0 ? (
        <div className="rounded-xl bg-card p-14 text-center">
          <p className="font-semibold text-text-1 text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-text-3 mb-4">
            Create a proposal to acquire a property. After approval and execution, FSFT can be claimed by investors.
          </p>
          {!address && (
            <p className="text-xs text-text-3">Connect your wallet (top right) to create proposals.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              showActions={false}
              onOpen={() => setSelectedProposal(p)}
            />
          ))}
        </div>
      )}
      <aside className="rounded-xl bg-card border border-border p-4 lg:sticky lg:top-24">
        <p className="text-xs text-text-3 uppercase tracking-wide font-medium mb-2">Governance snapshot</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span className="text-text-3">Total proposals</span><span className="font-semibold">{proposals.length}</span></div>
          <div className="flex items-center justify-between"><span className="text-text-3">Active</span><span className="font-semibold">{proposals.filter((p) => p.status === 0).length}</span></div>
          <div className="flex items-center justify-between"><span className="text-text-3">Passed</span><span className="font-semibold">{proposals.filter((p) => p.status === 1).length}</span></div>
          <div className="flex items-center justify-between"><span className="text-text-3">Executed</span><span className="font-semibold">{proposals.filter((p) => p.status === 3).length}</span></div>
        </div>
      </aside>
      </div>

      {selectedProposal && (
        <div className="fixed inset-0 z-[60] p-4 md:p-8">
          <button
            type="button"
            aria-label="Close proposal modal"
            className="absolute inset-0 bg-fs-anthracite/40 backdrop-blur-[2px]"
            onClick={() => setSelectedProposal(null)}
          />
          <div className="relative mx-auto mt-6 w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 md:p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-3 font-medium">Proposal #{selectedProposal.id}</p>
                <h2 className="text-xl font-brand-black text-text-1">
                  {selectedProposal.title || `Proposal #${selectedProposal.id}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                className="rounded-lg border border-border px-2.5 py-1 text-sm text-text-2 hover:text-text-1 hover:bg-bg"
              >
                Close
              </button>
            </div>

            {selectedProposal.description && (
              <p className="text-sm text-text-2 mb-4">{selectedProposal.description}</p>
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

            <div className="rounded-lg bg-bg border border-border p-3 mt-4">
              <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Description hash</p>
              <code className="text-xs font-mono break-all text-text-2">{selectedProposal.descHash}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
