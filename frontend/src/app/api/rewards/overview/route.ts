import { NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetRewardsOverview } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

const YEARLY_CURVE_PERCENTS = [13, 12, 11, 10, 10, 10, 9, 9, 8, 8];

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

function buildYearlySchedule(distributionPool: number) {
  return YEARLY_CURVE_PERCENTS.map((percent, index) => ({
    year: index + 1,
    percent,
    tokens: Math.floor((distributionPool * percent) / 100),
  }));
}

export async function GET() {
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetRewardsOverview());
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const rewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";
    if (!rewardsAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const admin = await getTestAccount(0);
    const from = AztecAddress.fromString(admin.address);

    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, admin.wallet);

    const cfg = simResult<{
      total_distribution_pool: bigint;
      total_distributed: bigint;
      total_claimed: bigint;
      current_epoch: bigint;
      total_epochs: bigint;
      claim_min: bigint;
    }>(await rewardsContract.methods.get_rewards_config().simulate({ from }));

    const distributionPool = toNumberStrict(cfg.total_distribution_pool, "ProtocolRewards.get_rewards_config.total_distribution_pool");
    const emittedToDate = toNumberStrict(cfg.total_distributed, "ProtocolRewards.get_rewards_config.total_distributed");
    const totalClaimed = toNumberStrict(cfg.total_claimed, "ProtocolRewards.get_rewards_config.total_claimed");
    const currentEpoch = toNumberStrict(cfg.current_epoch, "ProtocolRewards.get_rewards_config.current_epoch");
    const totalEpochs = toNumberStrict(cfg.total_epochs, "ProtocolRewards.get_rewards_config.total_epochs");
    const claimMin = toNumberStrict(cfg.claim_min, "ProtocolRewards.get_rewards_config.claim_min");
    const rewardStart = Date.parse(process.env.PROTOCOL_REWARDS_START ?? "2026-01-01T00:00:00.000Z");
    const epochMs = 30 * 24 * 60 * 60 * 1000;

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
      curveYearlyPercents: YEARLY_CURVE_PERCENTS,
      yearlySchedule: buildYearlySchedule(distributionPool),
      currentEpoch,
      claimMin,
      emittedToDate,
      totalClaimed,
      remainingPool: Math.max(0, distributionPool - emittedToDate),
      epochsRemaining: Math.max(0, totalEpochs - currentEpoch),
      nextEpochAt: rewardStart + (currentEpoch + 1) * epochMs,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/overview]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
