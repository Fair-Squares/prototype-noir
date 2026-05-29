"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  KpiCard,
  KpiGrid,
  PageHeader,
  Section,
  SkeletonKpi,
  SkeletonRow,
} from "@/components/ui";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { buildProjectRows, type ProjectRow } from "@/components/projects/ProjectRow";
import { useWallet } from "@/contexts/WalletContext";
import {
  claimProposalDistribution,
  fetchFundStats,
  fetchProperties,
  fetchProposals,
  formatEUR,
  type FundStats,
} from "@/lib/contracts";

export default function ProjectsPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [stats, setStats] = useState<FundStats | null>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, proposals, deeds] = await Promise.all([
        fetchFundStats(),
        fetchProposals(address ?? undefined, accountIndex),
        fetchProperties(),
      ]);
      setStats(nextStats);
      setRows(buildProjectRows(proposals, deeds));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load housing projects.");
    } finally {
      setLoading(false);
    }
  }, [address, accountIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = useCallback(
    async (proposalId: number) => {
      if (!address) {
        setNotice({ tone: "danger", text: "Connect your wallet to claim a distribution." });
        return;
      }
      setClaimingId(proposalId);
      setNotice(null);
      try {
        const result = await claimProposalDistribution(proposalId, address, accountIndex);
        if (!result.success) {
          setNotice({ tone: "danger", text: result.error ?? "Claim failed." });
          return;
        }
        const claimed =
          typeof result.claimedAmount === "number" ? ` (${formatEUR(result.claimedAmount)})` : "";
        setNotice({ tone: "success", text: `Distribution claimed for proposal #${proposalId}${claimed}.` });
        await load();
      } finally {
        setClaimingId(null);
      }
    },
    [address, accountIndex, load]
  );

  const capital = useMemo(() => {
    if (!stats) return null;
    return {
      available: stats.available,
      deployed: stats.totalInDefi,
      allocated: stats.totalAllocated,
    };
  }, [stats]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Deal room"
        title="Housing projects"
        description="Affordable-housing proposals funded by the pool, the property deeds they become, and the distributions flowing back to investors — all read straight from the contracts."
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error ? <Alert tone="danger" title="Could not load housing projects">{error}</Alert> : null}

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone} title={notice.tone === "success" ? "Done" : "Could not complete"}>
            {notice.text}
          </Alert>
        ) : null}
      </div>

      <section aria-label="Fund capital">
        {loading && !stats ? (
          <KpiGrid cols={3}>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </KpiGrid>
        ) : capital ? (
          <KpiGrid cols={3}>
            <KpiCard
              label="Available to deploy"
              value={formatEUR(capital.available)}
              sub="Uncommitted EUR ready for the next project"
            />
            <KpiCard
              label="Deployed"
              value={formatEUR(capital.deployed)}
              tone="accent"
              sub="Working in yield strategies"
            />
            <KpiCard
              label="Allocated to projects"
              value={formatEUR(capital.allocated)}
              sub="Committed to funded housing"
            />
          </KpiGrid>
        ) : null}
      </section>

      <Section
        title="Projects"
        description="On-chain only: each project is a funding proposal plus its property deed and distribution. Location, unit counts, tranches and covenant terms are not recorded on-chain and are not shown here."
        actions={
          <Link href="/governance" className="btn btn-ghost btn-sm">
            Open governance
          </Link>
        }
      >
        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-1">
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
          </div>
        ) : (
          <ProjectsTable
            rows={rows}
            address={address}
            claimingId={claimingId}
            onClaim={handleClaim}
          />
        )}
      </Section>
    </div>
  );
}
