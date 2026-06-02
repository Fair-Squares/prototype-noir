import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetFundStats } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

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
  if (!isLiveModeEnabled()) {
    return NextResponse.json({
      ...simGetFundStats(),
      ...buildV3FeatureMeta(),
    });
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

    const [HfJson, FtJson] = await Promise.all([
      loadGeneratedArtifactJson("housing_fund-HousingFund.json"),
      loadGeneratedArtifactJson("token_contract-Token.json"),
    ]);

    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);

    const [hfContract, ftContract] = await Promise.all([
      Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, admin.wallet),
      Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, admin.wallet),
    ]);

    const [
      stats,
      valuation,
      parkedPolicy,
      investorCount,
      isPaused,
      totalSupply,
      totalRentIncome,
      rorBps,
    ] = await Promise.all([
      hfContract.methods.get_fund_stats().simulate({ from }).then((r) =>
        simResult<{
          total_deposits: bigint;
          total_in_defi: bigint;
          total_allocated: bigint;
          available: bigint;
        }>(r)
      ),
      hfContract.methods.get_valuation().simulate({ from }).then((r) =>
        simResult<{
          last_asset_sale_price: bigint;
          last_fsft_minted: bigint;
          last_token_price_bps: bigint;
          last_valuation_block: bigint;
        }>(r)
      ),
      hfContract.methods.get_parked_capital_policy().simulate({ from }).then((r) =>
        simResult<{
          target_bps: bigint;
          min_bps: bigint;
          max_bps: bigint;
        }>(r)
      ),
      hfContract.methods.get_investor_count().simulate({ from }).then((r) =>
        toNumberStrict(simResult(r), "HousingFund.get_investor_count")
      ),
      hfContract.methods.is_paused().simulate({ from }).then((r) => Boolean(simResult(r))),
      ftContract.methods.total_supply().simulate({ from }).then((r) =>
        toNumberStrict(simResult(r), "FundToken.total_supply")
      ),
      hfContract.methods.get_total_rent_income().simulate({ from }).then((r) =>
        toNumberStrict(simResult(r), "HousingFund.get_total_rent_income")
      ),
      hfContract.methods.get_ror_bps().simulate({ from }).then((r) =>
        toNumberStrict(simResult(r), "HousingFund.get_ror_bps")
      ),
    ]);

    const totalDeposits = toNumberStrict(stats.total_deposits, "HousingFund.get_fund_stats.total_deposits");
    const totalInDefi = toNumberStrict(stats.total_in_defi, "HousingFund.get_fund_stats.total_in_defi");
    const totalAllocated = toNumberStrict(stats.total_allocated, "HousingFund.get_fund_stats.total_allocated");
    const available = toNumberStrict(stats.available, "HousingFund.get_fund_stats.available");
    // NAV = pooled CAPITAL only (deposit principal; property marks land later via
    // the valuation oracle). Rent is a SEPARATE claimable earnings stream and does
    // NOT inflate NAV — it is surfaced as `totalRentIncome` for the dedicated
    // "Rent earnings" display. See the canonical model in CLAUDE.md and
    // docs/PHASE1_YIELD_AND_RENT.md.
    const navEur = Math.max(0, totalDeposits);
    const navPerFsftEur = totalSupply > 0 ? Math.round((navEur / totalSupply) * 10000) / 10000 : 0;

    return NextResponse.json({
      totalDeposits,
      totalInDefi,
      totalAllocated,
      available,
      isPaused,
      investorCount,
      totalSupply,
      lastAssetSalePrice: toNumberStrict(valuation.last_asset_sale_price, "HousingFund.get_valuation.last_asset_sale_price"),
      lastFsftMinted: toNumberStrict(valuation.last_fsft_minted, "HousingFund.get_valuation.last_fsft_minted"),
      tokenPriceBps: toNumberStrict(valuation.last_token_price_bps, "HousingFund.get_valuation.last_token_price_bps"),
      valuationBlock: toNumberStrict(valuation.last_valuation_block, "HousingFund.get_valuation.last_valuation_block"),
      navEur,
      navPerFsftEur,
      totalRentIncome,
      rorBps,
      parkedAllocationBps: toNumberStrict(parkedPolicy.target_bps, "HousingFund.get_parked_capital_policy.target_bps"),
      parkedMinBps: toNumberStrict(parkedPolicy.min_bps, "HousingFund.get_parked_capital_policy.min_bps"),
      parkedMaxBps: toNumberStrict(parkedPolicy.max_bps, "HousingFund.get_parked_capital_policy.max_bps"),
      ...buildV3FeatureMeta(),
      source: "live",
    });
  } catch (error) {
    console.error("[fund/stats] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live fund stats" }, { status: 500 });
  }
}
