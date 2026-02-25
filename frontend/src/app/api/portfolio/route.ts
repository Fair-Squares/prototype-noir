import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetPortfolio(address));
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";

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

    // Prefer private balance for the selected account; fallback to public.
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

    // Prefer private FSFT balance for the selected account; fallback to public.
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
    }

    // Get housing fund total for share calculation
    const { getLiveFundStats } = await import("@/lib/aztecLive");
    const stats = await getLiveFundStats();
    const sharePercent = stats.totalDeposits > 0
      ? Math.round((fsftBalance / Math.max(stats.totalSupply, 1)) * 10000) / 100
      : 0;

    return NextResponse.json({
      balance: fsftBalance,
      eurBalance,
      depositedAmount: fsftBalance, // proxy: FSFT = deposited EUR in this prototype
      totalFundDeposits: stats.totalDeposits,
      totalSupply: stats.totalSupply,
      sharePercent,
      estimatedYield: Math.round(fsftBalance * 0.03),
      source: "live",
    });
  } catch (error) {
    console.error("[portfolio] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live portfolio" }, { status: 500 });
  }
}
