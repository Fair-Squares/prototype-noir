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

function toNumberStrict(value: unknown, fieldName: string): number {
  const parsed = toNumberSafe(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} is not a finite number`);
  }
  return parsed;
}

function expectTuple(value: unknown, expectedLength: number, methodName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${methodName} returned non-tuple response`);
  }
  if (value.length < expectedLength) {
    throw new Error(`${methodName} returned ${value.length} values, expected ${expectedLength}`);
  }
  return value;
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
    const defiVaultAddr = process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS ?? "";
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
    const stats = expectTuple(statsRaw, 4, "HousingFund.get_fund_stats");

    const valuationRaw = await hfContract.methods.get_valuation().simulate({ from });
    const valuation = expectTuple(valuationRaw, 4, "HousingFund.get_valuation");
    const parkedPolicyRaw = await hfContract.methods
      .get_parked_capital_policy()
      .simulate({ from });
    const parkedPolicy = expectTuple(parkedPolicyRaw, 3, "HousingFund.get_parked_capital_policy");
    const valuationVkHashRaw = await hfContract.methods.get_valuation_vk_hash().simulate({ from });
    const valuationRecursiveVkConfigured = isNonZeroField(valuationVkHashRaw);

    const investorCount = toNumberStrict(
      await hfContract.methods.get_investor_count().simulate({ from }),
      "HousingFund.get_investor_count"
    );
    const isPaused = Boolean(await hfContract.methods.is_paused().simulate({ from }));
    const totalSupply = toNumberStrict(await ftContract.methods.total_supply().simulate({ from }), "FundToken.total_supply");
    const totalDeposits = toNumberStrict(stats[0], "HousingFund.get_fund_stats.total_deposits");
    const totalInDefi = toNumberStrict(stats[1], "HousingFund.get_fund_stats.total_in_defi");
    const totalAllocated = toNumberStrict(stats[2], "HousingFund.get_fund_stats.total_allocated");
    const available = toNumberStrict(stats[3], "HousingFund.get_fund_stats.available");
    let totalYield = 0;
    if (defiVaultAddr) {
      const DvJson = await loadGeneratedArtifactJson("defi_vault-DeFiVault.json");
      const dvArtifact = loadContractArtifact(DvJson as Parameters<typeof loadContractArtifact>[0]);
      const dvContract = await Contract.at(AztecAddress.fromString(defiVaultAddr), dvArtifact, admin.wallet);
      totalYield = toNumberStrict(
        await dvContract.methods.get_accrued_yield().simulate({ from }),
        "DeFiVault.get_accrued_yield"
      );
    }
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
      lastAssetSalePrice: toNumberStrict(valuation[0], "HousingFund.get_valuation.last_asset_sale_price"),
      lastFsftMinted: toNumberStrict(valuation[1], "HousingFund.get_valuation.last_fsft_minted"),
      tokenPriceBps: toNumberStrict(valuation[2], "HousingFund.get_valuation.last_token_price_bps"),
      valuationBlock: toNumberStrict(valuation[3], "HousingFund.get_valuation.last_valuation_block"),
      valuationProofMode: valuationRecursiveVkConfigured ? "recursive-verified-path-configured" : "public-accounting",
      valuationRecursiveVkConfigured,
      navEur,
      navPerFsftEur,
      parkedAllocationBps: toNumberStrict(parkedPolicy[0], "HousingFund.get_parked_capital_policy.target_bps"),
      parkedMinBps: toNumberStrict(parkedPolicy[1], "HousingFund.get_parked_capital_policy.min_bps"),
      parkedMaxBps: toNumberStrict(parkedPolicy[2], "HousingFund.get_parked_capital_policy.max_bps"),
      ...buildV3FeatureMeta(),
      source: "live",
    });
  } catch (error) {
    console.error("[fund/stats] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live fund stats" }, { status: 500 });
  }
}
