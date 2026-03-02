import { NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetFundStats } from "@/lib/simulationStore";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function isNonZeroField(value: unknown): boolean {
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0";
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString() !== "0";
  }
  return false;
}

function buildV3FeatureMeta() {
  return {
    dex: {
      enabled: Boolean(process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS),
      priceBandBps: Number(process.env.DEX_PRICE_BAND_BPS ?? "200"),
      maxTtlBlocks: Number(process.env.DEX_MAX_TTL_BLOCKS ?? "120"),
    },
    rewards: {
      enabled: Boolean(process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS),
      claimMin: Number(process.env.PROTOCOL_REWARDS_CLAIM_MIN ?? "1"),
    },
    governanceVoting: {
      requiresInvestorRole: true,
      requiresEconomicExposure: true,
    },
  };
}

export async function GET() {
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json({
      ...simGetFundStats(),
      valuationProofMode: "public-accounting",
      valuationRecursiveVkConfigured: false,
      ...buildV3FeatureMeta(),
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    if (!housingFundAddr || !fundTokenAddr) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS and NEXT_PUBLIC_FUND_TOKEN_ADDRESS must be set" },
        { status: 500 }
      );
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const admin = await getTestAccount(0);
    const from = AztecAddress.fromString(admin.address);

    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");

    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);

    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, admin.wallet);
    const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, admin.wallet);

    const statsRaw = await hfContract.methods.get_fund_stats().simulate({ from });
    const stats = Array.isArray(statsRaw) ? statsRaw : [0, 0, 0, 0];

    const valuationRaw = await hfContract.methods.get_valuation().simulate({ from });
    const valuation = Array.isArray(valuationRaw) ? valuationRaw : [0, 0, 0, 0];
    const parkedPolicyRaw = await hfContract.methods
      .get_parked_capital_policy()
      .simulate({ from })
      .catch(() => [3000, 2000, 5000] as const);
    const parkedPolicy = Array.isArray(parkedPolicyRaw) ? parkedPolicyRaw : [3000, 2000, 5000];
    const valuationVkHashRaw = await hfContract.methods.get_valuation_vk_hash().simulate({ from }).catch(() => 0);
    const valuationRecursiveVkConfigured = isNonZeroField(valuationVkHashRaw);

    const investorCount = Number(await hfContract.methods.get_investor_count().simulate({ from }));
    const isPaused = Boolean(await hfContract.methods.is_paused().simulate({ from }));
    const totalSupply = Number(await ftContract.methods.total_supply().simulate({ from }));
    const totalDeposits = toNumberSafe(stats[0]);
    const totalInDefi = toNumberSafe(stats[1]);
    const totalAllocated = toNumberSafe(stats[2]);
    const available = toNumberSafe(stats[3]);
    const totalYield = 0;
    const navEur = Math.max(0, totalDeposits + totalYield);
    const navPerFsftEur = totalSupply > 0 ? Math.round((navEur / totalSupply) * 10000) / 10000 : 0;

    return NextResponse.json({
      totalDeposits,
      totalInDefi,
      totalAllocated,
      available,
      totalYield,
      isPaused,
      investorCount,
      totalSupply,
      lastAssetSalePrice: toNumberSafe(valuation[0]),
      lastFsftMinted: toNumberSafe(valuation[1]),
      tokenPriceBps: toNumberSafe(valuation[2]),
      valuationBlock: toNumberSafe(valuation[3]),
      valuationProofMode: valuationRecursiveVkConfigured ? "recursive-verified-path-configured" : "public-accounting",
      valuationRecursiveVkConfigured,
      navEur,
      navPerFsftEur,
      parkedAllocationBps: toNumberSafe(parkedPolicy[0]),
      parkedMinBps: toNumberSafe(parkedPolicy[1]),
      parkedMaxBps: toNumberSafe(parkedPolicy[2]),
      ...buildV3FeatureMeta(),
      source: "live",
    });
  } catch (error) {
    console.error("[fund/stats] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live fund stats" }, { status: 500 });
  }
}
