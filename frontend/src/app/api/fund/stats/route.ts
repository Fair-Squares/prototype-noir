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

export async function GET() {
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetFundStats());
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

    const investorCount = Number(await hfContract.methods.get_investor_count().simulate({ from }));
    const isPaused = Boolean(await hfContract.methods.is_paused().simulate({ from }));
    const totalSupply = Number(await ftContract.methods.total_supply().simulate({ from }));

    return NextResponse.json({
      totalDeposits: toNumberSafe(stats[0]),
      totalInDefi: toNumberSafe(stats[1]),
      totalAllocated: toNumberSafe(stats[2]),
      available: toNumberSafe(stats[3]),
      totalYield: 0,
      isPaused,
      investorCount,
      totalSupply,
      lastAssetSalePrice: toNumberSafe(valuation[0]),
      lastFsftMinted: toNumberSafe(valuation[1]),
      tokenPriceBps: toNumberSafe(valuation[2]),
      valuationBlock: toNumberSafe(valuation[3]),
      source: "live",
    });
  } catch (error) {
    console.error("[fund/stats] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live fund stats" }, { status: 500 });
  }
}
