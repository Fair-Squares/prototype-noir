import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetPortfolio(address));
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";

    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");

    // Use admin wallet just for reading (view calls don't need the user's wallet)
    const wallet = await getTestAccountWallet(0);

    let eurBalance = 0;
    let fsftBalance = 0;

    // Read EUR public balance via contract view call (no poseidon2 needed)
    if (eurTokenAddr) {
      const EurJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
      const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
      eurBalance = Number(await eurContract.methods.public_balance_of(AztecAddress.fromString(address)).simulate());
    }

    // Read FSFT public balance
    if (fundTokenAddr) {
      const FtJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
      const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
      fsftBalance = Number(await ftContract.methods.public_balance_of(AztecAddress.fromString(address)).simulate());
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
      totalSupply: stats.totalSupply,
      sharePercent,
      estimatedYield: Math.round(fsftBalance * 0.03),
      source: "live",
    });
  } catch (error) {
    console.error("[portfolio] live read failed, falling back to simulation:", error);
    return NextResponse.json({ ...simGetPortfolio(address), fallback: true });
  }
}
