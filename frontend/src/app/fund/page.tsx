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
import { HomeLifecycle } from "@/components/homes/HomeLifecycle";
import { buildHomeRows, type HomeRow } from "@/components/homes/homeRows";
import { ListingCard } from "@/components/projects/ListingCard";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { buildProjectRows } from "@/components/projects/ProjectRow";
import { useWallet } from "@/contexts/WalletContext";
import {
  claimProposalDistribution,
  createProposalFromListing,
  fetchFundStats,
  fetchFundingQueue,
  fetchKYCProfile,
  fetchListings,
  fetchProperties,
  fetchProposals,
  formatEUR,
  formatFSFT,
  runMatchNext,
  type FundStats,
  type FundingQueueEntry,
  type Listing,
} from "@/lib/contracts";

/**
 * S1 (UX_SIMPLIFICATION_PLAN.md): the Homes page. One card per home carrying
 * its whole lifecycle — council review → community vote → funding → owned —
 * instead of three parallel sections (onboarding listings, funding queue,
 * funding requests) that gave the same home four different names.
 */
export default function HomesPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [stats, setStats] = useState<FundStats | null>(null);
  const [homes, setHomes] = useState<HomeRow[]>([]);
  const [queue, setQueue] = useState<FundingQueueEntry[]>([]);
  const [isInvestor, setIsInvestor] = useState(false);
  const [openingVoteId, setOpeningVoteId] = useState<number | null>(null);
  const [matching, setMatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, proposals, deeds, nextListings, nextQueue, profile] = await Promise.all([
        fetchFundStats(),
        fetchProposals(address ?? undefined, accountIndex),
        fetchProperties(),
        fetchListings(),
        fetchFundingQueue(),
        address ? fetchKYCProfile(address) : Promise.resolve(null),
      ]);
      setStats(nextStats);
      setHomes(buildHomeRows(nextListings, buildProjectRows(proposals, deeds, nextListings), nextQueue));
      setQueue(nextQueue);
      setIsInvestor(Boolean(profile?.isInvestor));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the homes.");
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
        setNotice({ tone: "danger", text: "Connect your wallet to claim a payout." });
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
        setNotice({ tone: "success", text: `Payout claimed for home #${proposalId}${claimed}.` });
        await load();
      } catch (err: unknown) {
        setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Claim failed." });
      } finally {
        setClaimingId(null);
      }
    },
    [address, accountIndex, load]
  );

  const handleOpenVote = useCallback(
    async (listing: Listing) => {
      if (!address) {
        setNotice({ tone: "danger", text: "Connect your wallet to open the community vote." });
        return;
      }
      setOpeningVoteId(listing.id);
      setNotice(null);
      try {
        const result = await createProposalFromListing(
          address,
          listing.id,
          `Listing #${listing.id} acquisition`,
          `Acquisition of council-approved listing #${listing.id} (ask ${formatEUR(listing.askEur)}).`,
          accountIndex
        );
        setNotice({
          tone: "success",
          text: result.message ?? `Community vote opened for home listing #${listing.id}.`,
        });
        await load();
      } catch (err: unknown) {
        setNotice({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
      } finally {
        setOpeningVoteId(null);
      }
    },
    [address, accountIndex, load]
  );

  const handleMatch = useCallback(async () => {
    setMatching(true);
    setNotice(null);
    try {
      const result = await runMatchNext();
      if (!result.success) {
        setNotice({ tone: "danger", text: result.error ?? "Matching failed." });
        return;
      }
      setNotice({
        tone: "success",
        text:
          result.message ??
          (result.fundedProposalId != null
            ? `Home #${result.fundedProposalId} funded.`
            : "Matching complete."),
      });
      await load();
    } catch (err: unknown) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Matching failed." });
    } finally {
      setMatching(false);
    }
  }, [load]);

  /** Covenant-capped MONTHLY rent for a pre-proposal listing (no covenant yet
   *  → undefined; the comparison appears once the proposal carries one). */
  const cappedRentFor = useCallback((home: HomeRow): number | undefined => {
    const covenant = home.project?.proposal.covenant;
    if (!home.listing || !covenant?.isSet) return undefined;
    return Math.floor(Math.floor((home.listing.askEur * covenant.rentCeilingBps) / 10000) / 12);
  }, []);

  const fundableWaiting = useMemo(() => queue.filter((entry) => entry.fundable).length, [queue]);
  const projectRows = useMemo(
    () => homes.filter((h) => h.project !== null).map((h) => h.project!),
    [homes]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Homes"
        title="Homes"
        description="Every home the community is working on, from first submission to owned by the fund — one card per home, its whole story on one timeline."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Link href="/fund/submit" className="btn btn-primary btn-sm flex-shrink-0">
              Submit a property
            </Link>
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load the homes">
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

      {/* J6 note: a value-per-share *trend* is deliberately absent — the chain
          exposes only the latest valuation point, no history. Charting one
          would mean fabricating a series; it lands with the valuation-snapshot
          work in WEBSITE_ALIGNMENT.md §3.3. */}
      <section aria-label="Fund capital">
        <CapitalHeader stats={stats} loading={loading} />
      </section>

      {fundableWaiting > 0 ? (
        <Alert tone="info" title={`${fundableWaiting} approved home${fundableWaiting === 1 ? " is" : "s are"} waiting for funding`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Anyone can run the matching — the best-ranked affordable home is funded first
              (council score, then rent discount, then first come).
            </span>
            <Button size="sm" loading={matching} onClick={() => void handleMatch()}>
              {matching ? "Matching…" : "Run matching"}
            </Button>
          </div>
        </Alert>
      ) : null}

      <section aria-labelledby="homes-heading" className="flex flex-col gap-4">
        <h2 id="homes-heading" className="sr-only">
          All homes
        </h2>
        {loading && homes.length === 0 ? (
          <div className="flex flex-col gap-3">
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
          </div>
        ) : homes.length === 0 ? (
          <EmptyState
            title="No homes yet"
            description="The journey starts with an owner submitting a home — the capital ask, the attested market rent and the document dossier. The council reviews it, the community votes, and the fund buys it."
            action={
              <Link href="/fund/submit" className="btn btn-secondary btn-sm">
                Submit the first property
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {homes.map((home) =>
              home.project ? (
                <ProjectCard
                  key={home.key}
                  row={home.project}
                  address={address}
                  claiming={claimingId === home.project.id}
                  onClaim={handleClaim}
                  lifecycle={<HomeLifecycle stage={home.stage} />}
                  queueRank={home.queueRank}
                />
              ) : home.listing ? (
                <ListingCard
                  key={home.key}
                  listing={home.listing}
                  cappedMonthlyRentEur={cappedRentFor(home)}
                  lifecycle={<HomeLifecycle stage={home.stage} />}
                  action={
                    home.stage === "ready" && isInvestor ? (
                      <Button
                        size="sm"
                        onClick={() => void handleOpenVote(home.listing!)}
                        disabled={openingVoteId !== null}
                        loading={openingVoteId === home.listing.id}
                      >
                        Open the community vote
                      </Button>
                    ) : undefined
                  }
                />
              ) : null
            )}
          </div>
        )}
      </section>

      {projectRows.length > 0 ? (
        <AdvancedDetails summary="All on-chain fields">
          <p className="text-caption mb-3 text-text-2">
            Every home with its raw on-chain fields, including the voted affordability terms
            (capped rent, discount vs the attested market reference, lock). Location and unit counts
            are not recorded on-chain, so they are not shown here.
          </p>
          <ProjectsTable rows={projectRows} />
        </AdvancedDetails>
      ) : null}
    </div>
  );
}
