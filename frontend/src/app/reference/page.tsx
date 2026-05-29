"use client";

import { useEffect, useState } from "react";
import { PageHero } from "@/components/SimplePage";
import { fetchChainParams, type ChainParams } from "@/lib/contracts";
import { formatDuration } from "@/lib/chainParams";

interface RewardsOverview {
  currentEpoch: number;
  token: { distributionPool: number; totalEpochs: number };
  emittedToDate: number;
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-text-1">{label}</p>
        {hint && <p className="text-meta text-text-3">{hint}</p>}
      </div>
      <p className="shrink-0 text-sm font-semibold text-text-1">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-heading mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export default function ReferencePage() {
  const [params, setParams] = useState<ChainParams | null>(null);
  const [rewards, setRewards] = useState<RewardsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChainParams()
      .then(setParams)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load parameters."));
    // Rewards overview is a live read and may be slow/unavailable; treat as optional.
    fetch("/api/rewards/overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setRewards(d as RewardsOverview);
      })
      .catch(() => setRewards(null));
  }, []);

  const t = params?.timing;
  const g = params?.governance;
  const d = params?.dex;

  return (
    <div className="space-y-6">
      <PageHero
        title="Parameters"
        subtitle="Chain timing, governance rules, and protocol limits for this local network."
        ctaHref="/explain"
        ctaLabel="How it works"
        badge={false}
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {t?.blockProductionMode === "on-demand" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Blocks are currently produced <strong>on-demand</strong> — a new block is sealed only when there
          is a transaction, so the chain&apos;s clock advances with activity. Time estimates below assume a
          steady block every slot (set <code>SEQ_MIN_TX_PER_BLOCK=0</code> on the node for that).
        </div>
      )}

      {!params ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-text-3">Loading parameters…</div>
      ) : (
        <>
          <Card title="Chain timing">
            <Row label="L2 slot / block time" value={`${t!.aztecSlotDurationSec}s`} hint="One L2 block per slot" />
            <Row label="L1 (Anvil) block time" value={`${t!.ethereumSlotDurationSec}s`} />
            <Row
              label="Epoch"
              value={`${t!.epochDurationSlots} slots (${formatDuration(t!.epochDurationSec)})`}
            />
            <Row label="Block production" value={t!.blockProductionMode} />
            <Row label="Single tx inclusion" value={`~1 slot (~${t!.aztecSlotDurationSec}s)`} hint="Plus client-side proof generation" />
          </Card>

          <Card title="Governance & voting">
            <Row
              label="Voting window"
              value={`${g!.votingWindowBlocks} blocks`}
              hint={`≈ ${formatDuration(g!.votingWindowSecondsEstimate)} at ${t!.aztecSlotDurationSec}s/block`}
            />
            <Row label="Quorum (votes needed)" value={`${g!.minQuorumVotes}`} hint="Minimum total votes for a valid result" />
            <Row label="Vote weight" value="1 vote / account" hint="One account, one vote — not token-weighted" />
            <Row label="Eligibility" value="KYC + fund position" hint="Investor credential plus a deposit or FSFT holding" />
            <Row label="Pass rule" value="quorum met & Yes > No" />
            <Row label="Finalize" value="after window closes" hint="Anyone can finalize once the deadline block is reached" />
            <Row label="Ballot privacy" value="private (1 per account)" hint="A nullifier prevents double-voting without revealing the voter" />
          </Card>

          <Card title="Proposal lifecycle (estimated)">
            <Row label="1. Create proposal" value="~1 slot" hint="One transaction by an eligible investor" />
            <Row
              label="2. Voting open"
              value={`${g!.votingWindowBlocks} blocks (~${formatDuration(g!.votingWindowSecondsEstimate)})`}
            />
            <Row label="3. Finalize" value="~1 slot" hint="Tally and mark passed/failed after the window" />
            <Row label="4. Execute" value="~1 slot" hint="Opens the distribution for claims" />
          </Card>

          <Card title="DEX (FSFT / EUR)">
            <Row label="Price band" value={`±${(d!.priceBandBps / 100).toFixed(2)}%`} hint="Allowed deviation from the reference price" />
            <Row
              label="Max order TTL"
              value={`${d!.maxTtlBlocks} blocks`}
              hint={`≈ ${formatDuration(d!.maxTtlSecondsEstimate)} at ${t!.aztecSlotDurationSec}s/block`}
            />
          </Card>

          <Card title="Protocol rewards (FSP)">
            <Row label="Claim minimum" value={`${params.rewards.claimMin} FSP`} />
            {rewards ? (
              <>
                <Row label="Distribution pool" value={rewards.token.distributionPool.toLocaleString()} />
                <Row label="Total epochs" value={`${rewards.token.totalEpochs}`} />
                <Row label="Current epoch" value={`${rewards.currentEpoch}`} />
                <Row label="Emitted to date" value={rewards.emittedToDate.toLocaleString()} />
              </>
            ) : (
              <Row label="Live rewards data" value="unavailable" hint="Connect / live mode required" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
