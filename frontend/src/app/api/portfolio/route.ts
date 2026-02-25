import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetPortfolio(address));
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");

    const selected = await getTestAccount(accountIndex);
    const wallet = selected.wallet;
    const selectedAddr = AztecAddress.fromString(selected.address);
    const ownerAddr = AztecAddress.fromString(address);
    const isOwnAccount = selected.address.toLowerCase() === address.toLowerCase();

    let eurBalance = 0;
    let fsftBalance = 0;
    let depositTicket = 0;
    let totalFundDeposits = 0;
    let totalInDefi = 0;
    let totalAllocated = 0;
    let available = 0;
    let totalSupply = 0;
    let lastAssetSalePrice = 0;
    let lastFsftMinted = 0;
    let tokenPriceBps = 0;

    if (eurTokenAddr) {
      const EurJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
      const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
      if (isOwnAccount) {
        try {
          eurBalance = Number(await eurContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        } catch {
          eurBalance = Number(await eurContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        }
      } else {
        eurBalance = Number(await eurContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
      }
    }

    if (fundTokenAddr) {
      const FtJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
      const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
      if (isOwnAccount) {
        try {
          fsftBalance = Number(await ftContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        } catch {
          fsftBalance = Number(await ftContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        }
      } else {
        fsftBalance = Number(await ftContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
      }
      totalSupply = Number(await ftContract.methods.total_supply().simulate({ from: selectedAddr }));
    }

    if (housingFundAddr) {
      const HfJson = (await import("@/artifacts/housing_fund-HousingFund.json")).default;
      const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);

      const statsRaw = await hfContract.methods.get_fund_stats().simulate({ from: selectedAddr });
      const stats = Array.isArray(statsRaw) ? statsRaw : [0, 0, 0, 0];
      totalFundDeposits = toNumberSafe(stats[0]);
      totalInDefi = toNumberSafe(stats[1]);
      totalAllocated = toNumberSafe(stats[2]);
      available = toNumberSafe(stats[3]);

      depositTicket = Number(
        await hfContract.methods.get_user_deposit_ticket(ownerAddr).simulate({ from: selectedAddr })
      );

      const valuationRaw = await hfContract.methods.get_valuation().simulate({ from: selectedAddr });
      const valuation = Array.isArray(valuationRaw) ? valuationRaw : [0, 0, 0, 0];
      lastAssetSalePrice = toNumberSafe(valuation[0]);
      lastFsftMinted = toNumberSafe(valuation[1]);
      tokenPriceBps = toNumberSafe(valuation[2]);
    }

    const sharePercent = totalSupply > 0 ? Math.round((fsftBalance / totalSupply) * 10000) / 100 : 0;
    const tokenPriceEur = tokenPriceBps > 0 ? tokenPriceBps / 10000 : 1;
    const fsftMarketValue = Math.round(fsftBalance * tokenPriceEur * 100) / 100;

    return NextResponse.json({
      balance: fsftBalance,
      eurBalance,
      depositedAmount: depositTicket,
      totalFundDeposits,
      totalInDefi,
      totalAllocated,
      available,
      totalSupply,
      sharePercent,
      estimatedYield: Math.round(depositTicket * 0.03),
      tokenPriceBps,
      tokenPriceEur,
      fsftMarketValue,
      lastAssetSalePrice,
      lastFsftMinted,
      source: "live",
    });
  } catch (error) {
    console.error("[portfolio] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live portfolio" }, { status: 500 });
  }
}
