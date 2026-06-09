"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AdvancedDetails,
  Button,
  EmptyState,
  PageHeader,
  SkeletonRow,
} from "@/components/ui";
import { CapitalHeader } from "@/components/projects/CapitalHeader";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { buildProjectRows, type ProjectRow } from "@/components/projects/ProjectRow";
import { useWallet } from "@/contexts/WalletContext";
import {
  claimProposalDistribution,
  fetchFundStats,
  fetchProperties,
  fetchProposals,
  formatEUR,
  formatFSFT,
  type FundStats,
} from "@/lib/contracts";

/** Order projects so the ones that still need committee attention surface first:
 * open voting, then closed-but-unfinalised, then funded/distributing, then
 * terminal. Within each band keep newest-first (buildProjectRows already sorts
 * by id descending). */
function dealRoomRank(row: ProjectRow): number {
  if (row.status === 0) return 0; // active / voting open or just-ended
  if (row.status === 1) return 1; // approved, awaiting execution
  if (row.distributionOpened) return 2; // funded & distributing
  if (row.status === 3) return 3; // executed
  return 4; // rejected
}

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
          typeof result.claimedAmount === "number" ? ` (${formatFSFT(result.claimedAmount)})` : "";
        setNotice({
          tone: "success",
          text: `Distribution claimed for proposal #${proposalId}${claimed}.`,
        });
        await load();
      } catch (err: unknown) {
        setNotice({
          tone: "danger",
          text: err instanceof Error ? err.message : "Claim failed.",
        });
      } finally {
        setClaimingId(null);
      }
    },
    [address, accountIndex, load]
  );

  const orderedRows = useMemo(
    () => [...rows].sort((a, b) => dealRoomRank(a) - dealRoomRank(b)),
    [rows]
  );

  const summary = useMemo(() => {
    const needsCapital = rows.filter((r) => r.status === 0 || r.status === 1).length;
    const funded = rows.filter((r) => r.status === 3 || r.distributionOpened).length;
    return { total: rows.length, needsCapital, funded };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Deal room"
        title="Housing projects"
        description="Each housing project is a funding request the pool can finance. Track which homes need capital, where each one stands in its lifecycle, and the proceeds flowing back to depositors — read straight from the contracts."
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load housing projects">
          {error}
        </Alert>
      ) : null}

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone} title={notice.tone === "success" ? "Done" : "Could not complete"}>
            {notice.text}
          </Alert>
        ) : null}
      </div>

      <section aria-label="Fund capital">
        <CapitalHeader stats={stats} loading={loading} />
      </section>

      <section aria-labelledby="funding-requests-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="funding-requests-heading" className="text-heading text-text-1">
              Funding requests
            </h2>
            <p className="text-caption mt-1 text-text-2">
              {loading
                ? "Loading on-chain housing projects…"
                : summary.total === 0
                  ? "No funding requests on-chain yet."
                  : `${summary.total} project${summary.total === 1 ? "" : "s"} · ${summary.needsCapital} awaiting the committee · ${summary.funded} funded.`}
            </p>
          </div>
          <Link href="/governance" className="btn btn-ghost btn-sm flex-shrink-0">
            Open governance board
          </Link>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-3">
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
          </div>
        ) : orderedRows.length === 0 ? (
          <EmptyState
            title="No housing projects yet"
            description="Projects appear here once a funding proposal is created on-chain. Approved proposals become property deeds held by the fund, and their proceeds open as distributions you can claim."
            action={
              <Link href="/governance" className="btn btn-secondary btn-sm">
                Open governance board
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {orderedRows.map((row) => (
              <ProjectCard
                key={row.id}
                row={row}
                address={address}
                claiming={claimingId === row.id}
                onClaim={handleClaim}
              />
            ))}
          </div>
        )}
      </section>

      {rows.length > 0 ? (
        <AdvancedDetails summary="All on-chain fields">
          <p className="text-caption mb-3 text-text-2">
            Every funding request with its raw on-chain fields. Location, unit counts, affordability
            covenants and capped-return terms are not recorded on-chain, so they are not shown here.
          </p>
          <ProjectsTable rows={rows} />
        </AdvancedDetails>
      ) : null}
    </div>
  );
}
