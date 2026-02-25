"use client";

import { useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchProposals,
  castVote,
  createProposal,
  finalizeProposal,
  executeProposal,
  type Proposal,
} from "@/lib/contracts";

export default function GovernancePage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create proposal form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "" });

  const refresh = () => fetchProposals().then(setProposals);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  const handleVote = async (proposalId: number, voteYes: boolean) => {
    if (!address) { notify("error", "Connect your wallet first."); return; }
    setLoading(true);
    try {
      const result = await castVote(address, proposalId, voteYes, accountIndex);
      if (result.success) { notify("success", `Vote on #${proposalId} recorded.`); await refresh(); }
      else notify("error", result.error ?? "Vote failed");
    } finally { setLoading(false); }
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
        notify("success", result.message ?? `Asset acquired — ${result.fsftMinted?.toLocaleString()} FSFT minted!`);
        await refresh();
      } else notify("error", result.error ?? "Execute failed");
    } finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) { notify("error", "Connect your wallet first."); return; }
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Proposals</h1>
          <p className="text-text-2 text-sm">Vote on property acquisitions. Voting windows are enforced on-chain by block deadlines. Executed proposals distribute FSFT to investor wallets.</p>
        </div>
        {address && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg bg-fs-magenta text-white text-sm font-medium hover:bg-fs-magenta/90 transition-colors"
          >
            {showCreate ? "Cancel" : "+ New Proposal"}
          </button>
        )}
      </div>

      {/* Create proposal form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-fs-magenta/20 bg-card p-6 space-y-4">
          <h2 className="font-semibold text-text-1">New Property Proposal</h2>
          <div>
            <label className="block text-sm text-text-2 mb-1">Title</label>
            <input
              type="text"
              placeholder="e.g. Acqusition of 3 flats in Amsterdam Noord"
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
      {proposals.length === 0 ? (
        <div className="rounded-xl bg-card p-14 text-center">
          <p className="font-semibold text-text-1 text-lg mb-2">No proposals yet</p>
          <p className="text-sm text-text-3 mb-4">
            Create a proposal to acquire a property. When it passes and executes, FSFT is distributed pro-rata from on-chain deposit tickets.
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
              onVote={handleVote}
              onFinalize={handleFinalize}
              onExecute={handleExecute}
              isVoting={loading}
              userAddress={address}
            />
          ))}
        </div>
      )}
    </div>
  );
}
