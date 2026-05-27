"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import { ActionPanel, MetricRow, PageHero } from "@/components/SimplePage";
import { useWallet } from "@/contexts/WalletContext";
import {
  attestFsftForVoting,
  createProposal,
  fetchGovernanceEligibility,
  fetchKYCProfile,
  fetchProposals,
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
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [kycProfile, setKycProfile] = useState<KYCProfile>({ verified: false, isInvestor: false, roles: [] });
  const [eligibility, setEligibility] = useState<GovernanceEligibility | null>(null);
  const [form, setForm] = useState({ title: "", description: "", amount: "" });

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const nextProposals = await fetchProposals(address ?? undefined, accountIndex);
      setProposals(nextProposals);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Could not load proposals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [address, accountIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!address) {
      setKycProfile({ verified: false, isInvestor: false, roles: [] });
      setEligibility(null);
      return;
    }

    Promise.all([fetchKYCProfile(address), fetchGovernanceEligibility(address, accountIndex)])
      .then(([profile, nextEligibility]) => {
        setKycProfile(profile);
        setEligibility(nextEligibility);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load voting readiness.");
      });
  }, [address, accountIndex]);

  const counts = useMemo(
    () => ({
      active: proposals.filter((proposal) => proposal.status === 0).length,
      passed: proposals.filter((proposal) => proposal.status === 1).length,
      executed: proposals.filter((proposal) => proposal.status === 3).length,
    }),
    [proposals]
  );

  const canCreate = Boolean(address && kycProfile.isInvestor);
  const canVote = Boolean(eligibility?.canVote);
  const activeProposal = proposals.find((proposal) => proposal.status === 0) ?? null;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }
    if (!canCreate) {
      notify("error", "Investor role required to create proposals.");
      return;
    }

    const amount = Number(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      notify("error", "Title and valid amount are required.");
      return;
    }

    setCreating(true);
    try {
      const result = await createProposal(address, form.title.trim(), form.description.trim(), amount, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Create failed.");
        return;
      }

      notify("success", "Proposal created.");
      setForm({ title: "", description: "", amount: "" });
      setShowCreate(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleAttestFsft = async () => {
    if (!address) {
      notify("error", "Connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      const result = await attestFsftForVoting(address, accountIndex);
      if (!result.success) {
        notify("error", result.error ?? "Private check failed.");
        return;
      }

      notify("success", "Private Fund Shares check completed.");
      const nextEligibility = await fetchGovernanceEligibility(address, accountIndex);
      setEligibility(nextEligibility);
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    { label: "Active", value: counts.active.toLocaleString() },
    { label: "Passed", value: counts.passed.toLocaleString() },
    { label: "Executed", value: counts.executed.toLocaleString() },
    { label: "Voting Readiness", value: canVote ? "Ready" : "Not Ready", accent: canVote },
  ];

  return (
    <div className="space-y-6">
      <PageHero
        title="Vote"
        subtitle="Review proposals and choose your vote."
        ctaHref="/explain"
        ctaLabel="Explain Rules"
      />

      {loadError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-fs-teal/20 bg-fs-teal/10 text-fs-teal-dark"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <MetricRow items={metrics} />

      <ActionPanel title="What To Do Now" subtitle="Pick one">
        <div className="grid gap-2 sm:grid-cols-2">
          {activeProposal ? (
            <Link
              href={`/governance/${activeProposal.id}`}
              className="rounded-lg bg-fs-teal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-fs-teal-dark"
            >
              Vote
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-2 text-center text-sm font-semibold text-text-3">
              No Active Vote
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowCreate((current) => !current)}
            disabled={!canCreate}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-2 hover:bg-bg hover:text-text-1 disabled:opacity-50"
          >
            {showCreate ? "Hide Create" : "Create"}
          </button>
        </div>

        <p className="mt-3 text-xs text-text-3">
          {canVote ? "You are ready to vote." : eligibility?.reason ?? "Complete requirements to vote."}
        </p>

        {address && kycProfile.isInvestor && !canVote && (
          <button
            type="button"
            onClick={handleAttestFsft}
            disabled={loading}
            className="mt-2 text-xs font-semibold text-fs-teal hover:underline disabled:opacity-50"
          >
            Run private Fund Shares check
          </button>
        )}
      </ActionPanel>

      {showCreate && (
        <section className="surface p-5">
          <p className="text-xs uppercase tracking-wide text-text-3 mb-2">Create Proposal</p>
          <form onSubmit={handleCreate} className="space-y-3">
            <label className="block">
              <p className="mb-1 text-xs text-text-3">Title</p>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <p className="mb-1 text-xs text-text-3">Budget (EURs)</p>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <p className="mb-1 text-xs text-text-3">Short note (optional)</p>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
            </label>

            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-fs-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-fs-magenta/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Proposal"}
            </button>
          </form>
        </section>
      )}

      <section className="surface p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Proposals</h2>
          <Link href="/explain" className="text-xs font-semibold text-fs-teal hover:underline">
            Advanced metadata in Explain
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-bg animate-pulse" />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <p className="rounded-lg border border-border bg-bg p-6 text-sm text-text-3">No proposals yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                mode="compact"
                actionHref={`/governance/${proposal.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
