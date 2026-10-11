import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetRewardsStatus } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return Number.NaN;
}

function toNumberStrict(value: unknown, fieldName: string): number {
  const parsed = toNumberSafe(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} is not a finite number`);
  }
  return parsed;
}

async function fetchJsonOrThrow(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}) for ${url}: ${text || "empty response"}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function buildEligibility(
  investorRole: boolean,
  depositBucketEligible: boolean,
  fsftBalance: number,
  fsftRewardsAttested: boolean,
  claimable: number,
  claimMin: number,
  fsftProofMode: "none" | "aztec-private-proven" | "recursive-verified",
  recursiveVkConfigured: boolean
) {
  const fsftBucketEligible = investorRole && fsftBalance > 0 && fsftRewardsAttested;
  const canClaimNow = claimable >= claimMin;
  const nextSteps: string[] = [];

  if (!investorRole) {
    nextSteps.push("Complete KYC to unlock FSP rewards.");
  }
  if (investorRole && !depositBucketEligible) {
    nextSteps.push("Add EURs in Invest to join the deposit reward bucket.");
  }
  if (investorRole && fsftBalance <= 0) {
    nextSteps.push("Hold FSFT to join the FSFT reward bucket.");
  } else if (investorRole && fsftBalance > 0 && !fsftRewardsAttested) {
    nextSteps.push("Enable FSFT rewards in Portfolio.");
  }
  if (investorRole) {
    nextSteps.push("Vote on active proposals this month to earn the governance reward share.");
  }
  if (!canClaimNow) {
    nextSteps.push(`Claims open when you have at least ${claimMin} FSP.`);
  }

  return {
    investorRole,
    depositBucketEligible,
    fsftBucketEligible,
    governanceBucketHint: investorRole
      ? "Governance rewards are based on participation each epoch. Keep voting in active proposals."
      : "Complete KYC first to unlock governance rewards.",
    fsftRewardsAttested,
    fsftProofMode,
    recursiveVkConfigured,
    proofGuidance: recursiveVkConfigured
      ? "Recursive verifier is configured for FSFT holder eligibility."
      : "FSFT eligibility currently uses Aztec private execution proof flow.",
    canClaimNow,
    nextSteps,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetRewardsStatus(address));
  }

  try {
    const rewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";
    const protocolTokenAddr = process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "";
    if (!rewardsAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec-labs/aztec.js/abi");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    const actorAddress = AztecAddress.fromStringUnsafe(actor.address);
    const userAddress = AztecAddress.fromStringUnsafe(address);
    if (actor.address.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    // Self-calls must NOT derive their origin from the request URL: behind a
    // proxy that origin reflects the caller-controlled Host header (steerable
    // to an arbitrary host) and breaks when the internal port differs from the
    // public one. Loop back over the server's own listen port instead.
    const origin =
      process.env.FS_INTERNAL_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

    // The three independent read groups below have no data dependency on one
    // another, so kick them all off concurrently:
    //   1. the ProtocolRewards contract reads (config + user stats + eligibility),
    //   2. the optional FSP token balance read, and
    //   3. the portfolio + governance HTTP pre-checks.
    const rewardsReadsP = (async () => {
      const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
      const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
      const rewardsContract = await Contract.at(AztecAddress.fromStringUnsafe(rewardsAddr), rewardsArtifact, actor.wallet);
      return Promise.all([
        rewardsContract.methods.get_rewards_config().simulate({ from: actorAddress }),
        rewardsContract.methods.get_user_stats(userAddress).simulate({ from: actorAddress }),
        rewardsContract.methods.has_fsft_rewards_eligibility(userAddress).simulate({ from: actorAddress }),
      ]);
    })();

    const balanceP = (async () => {
      if (!protocolTokenAddr) return 0;
      const FtJson = await loadGeneratedArtifactJson("token_contract-Token.json");
      const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
      const tokenContract = await Contract.at(
        AztecAddress.fromStringUnsafe(protocolTokenAddr),
        ftArtifact,
        actor.wallet
      );
      return toNumberStrict(
        simResult(await tokenContract.methods.balance_of_public(userAddress).simulate({ from: actorAddress })),
        "ProtocolToken.balance_of_public"
      );
    })();

    const [[configSim, userSim, eligibilitySim], balance, [portfolio, governance]] = await Promise.all([
      rewardsReadsP,
      balanceP,
      Promise.all([
        fetchJsonOrThrow(
          `${origin}/api/portfolio?address=${encodeURIComponent(address)}&accountIndex=${accountIndex}`
        ),
        fetchJsonOrThrow(
          `${origin}/api/governance/eligibility?address=${encodeURIComponent(address)}&accountIndex=${accountIndex}`
        ),
      ]),
    ]);

    const cfg = simResult<{
      total_distribution_pool: bigint;
      total_distributed: bigint;
      total_claimed: bigint;
      current_epoch: bigint;
      total_epochs: bigint;
      claim_min: bigint;
    }>(configSim);
    const user = simResult<{
      claimable: bigint;
      total_claimed: bigint;
      last_claimed_epoch: bigint;
    }>(userSim);

    const distributionPool = toNumberStrict(cfg.total_distribution_pool, "ProtocolRewards.get_rewards_config.total_distribution_pool");
    const emittedToDate = toNumberStrict(cfg.total_distributed, "ProtocolRewards.get_rewards_config.total_distributed");
    const totalClaimed = toNumberStrict(cfg.total_claimed, "ProtocolRewards.get_rewards_config.total_claimed");
    const currentEpoch = toNumberStrict(cfg.current_epoch, "ProtocolRewards.get_rewards_config.current_epoch");
    const totalEpochs = toNumberStrict(cfg.total_epochs, "ProtocolRewards.get_rewards_config.total_epochs");
    const claimMin = toNumberStrict(cfg.claim_min, "ProtocolRewards.get_rewards_config.claim_min");

    const claimable = toNumberStrict(user.claimable, "ProtocolRewards.get_user_stats.claimable");
    const totalUserClaimed = toNumberStrict(user.total_claimed, "ProtocolRewards.get_user_stats.total_user_claimed");
    const rawLastClaimedEpoch = toNumberStrict(user.last_claimed_epoch, "ProtocolRewards.get_user_stats.last_claimed_epoch");
    // V2: per-user attestation flag is gone; FSFT reward-bucket eligibility is
    // now derived on-chain from balance_of_public(user) > 0.
    const fsftRewardsAttested = Boolean(simResult(eligibilitySim));

    const lastClaimedEpoch = totalUserClaimed > 0 ? rawLastClaimedEpoch : -1;
    const rewardStart = Date.parse(process.env.PROTOCOL_REWARDS_START ?? "2026-01-01T00:00:00.000Z");
    const epochMs = 30 * 24 * 60 * 60 * 1000;
    const nextEpochAt = rewardStart + (currentEpoch + 1) * epochMs;

    const depositBucketEligible = Number(portfolio?.depositedAmount ?? 0) > 0;
    const fsftBalance = Number(portfolio?.balance ?? 0);
    const portfolioGovernance =
      (portfolio?.governanceEligibility as { investorRole?: boolean } | undefined)?.investorRole ?? false;
    const investorRole = Boolean(governance?.investorRole ?? portfolioGovernance ?? false);
    const fsftProofMode = (governance?.privateFsftProofMode ??
      "none") as "none" | "aztec-private-proven" | "recursive-verified";
    const recursiveVkConfigured = false;
    const eligibility = buildEligibility(
      investorRole,
      depositBucketEligible,
      fsftBalance,
      fsftRewardsAttested,
      claimable,
      claimMin,
      fsftProofMode,
      recursiveVkConfigured
    );

    return NextResponse.json({
      token: {
        symbol: "FSP",
        totalSupply: 10_000_000,
        distributionPool,
        years: 10,
        totalEpochs,
      },
      weighting: {
        deposit: 40,
        fsft: 40,
        governance: 20,
      },
      currentEpoch,
      lastClaimedEpoch,
      nextClaimableEpoch: Math.max(0, lastClaimedEpoch + 1),
      claimableUptoEpoch: currentEpoch,
      claimable,
      claimMin,
      emittedToDate,
      totalClaimed,
      totalUserClaimed,
      balance,
      fsftRewardsAttested,
      eligibility,
      source: "live",
      nextEpochAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/stats]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
