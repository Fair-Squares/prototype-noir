import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetRewardsStatus } from "@/lib/simulationStore";

function isNonZeroField(value: unknown): boolean {
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0";
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString() !== "0";
  }
  return false;
}

async function fetchJsonSafe(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
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

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetRewardsStatus(address));
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const rewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";
    const protocolTokenAddr = process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "";
    if (!rewardsAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    const actorAddress = AztecAddress.fromString(actor.address);
    const userAddress = AztecAddress.fromString(address);

    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, actor.wallet);

    const [configRaw, userRaw, weightsVkHashRaw] = await Promise.all([
      rewardsContract.methods.get_rewards_config().simulate({ from: actorAddress }),
      rewardsContract.methods.get_user_stats(userAddress).simulate({ from: actorAddress }),
      rewardsContract.methods
        .get_rewards_weights_vk_hash()
        .simulate({ from: actorAddress }),
    ]);

    const cfg = Array.isArray(configRaw) ? configRaw : [8_000_000, 0, 0, 0, 120, 1];
    const user = Array.isArray(userRaw) ? userRaw : [0, 0, 0, false];

    const distributionPool = Number(cfg[0] ?? 8_000_000);
    const emittedToDate = Number(cfg[1] ?? 0);
    const totalClaimed = Number(cfg[2] ?? 0);
    const currentEpoch = Number(cfg[3] ?? 0);
    const totalEpochs = Number(cfg[4] ?? 120);
    const claimMin = Number(cfg[5] ?? 1);

    const claimable = Number(user[0] ?? 0);
    const totalUserClaimed = Number(user[1] ?? 0);
    const rawLastClaimedEpoch = Number(user[2] ?? 0);
    const fsftRewardsAttested = Boolean(user[3]);
    let balance = 0;

    if (protocolTokenAddr) {
      try {
        const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
        const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
        const tokenContract = await Contract.at(
          AztecAddress.fromString(protocolTokenAddr),
          ftArtifact,
          actor.wallet
        );
        balance = Number(
          await tokenContract.methods.public_balance_of(userAddress).simulate({ from: actorAddress })
        );
      } catch {
        balance = 0;
      }
    }

    const lastClaimedEpoch = totalUserClaimed > 0 ? rawLastClaimedEpoch : -1;
    const rewardStart = Date.parse(process.env.PROTOCOL_REWARDS_START ?? "2026-01-01T00:00:00.000Z");
    const epochMs = 30 * 24 * 60 * 60 * 1000;
    const nextEpochAt = rewardStart + (currentEpoch + 1) * epochMs;
    const origin = new URL(request.url).origin;

    const [portfolio, governance] = await Promise.all([
      fetchJsonSafe(
        `${origin}/api/portfolio?address=${encodeURIComponent(address)}&accountIndex=${accountIndex}`
      ),
      fetchJsonSafe(
        `${origin}/api/governance/eligibility?address=${encodeURIComponent(address)}&accountIndex=${accountIndex}`
      ),
    ]);

    const depositBucketEligible = Number(portfolio?.depositedAmount ?? 0) > 0;
    const fsftBalance = Number(portfolio?.balance ?? 0);
    const portfolioGovernance =
      (portfolio?.governanceEligibility as { investorRole?: boolean } | undefined)?.investorRole ?? false;
    const investorRole = Boolean(governance?.investorRole ?? portfolioGovernance ?? false);
    const fsftProofMode = (governance?.privateFsftProofMode ??
      "none") as "none" | "aztec-private-proven" | "recursive-verified";
    const recursiveVkConfigured =
      Boolean(governance?.recursiveVkConfigured ?? false) || isNonZeroField(weightsVkHashRaw);
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
