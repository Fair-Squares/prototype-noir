import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetFundStats, simGetPortfolio } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const stats = simGetFundStats();
    const portfolio = address ? simGetPortfolio(address) : null;

    return NextResponse.json({
      fundToken: {
        address: process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "sim",
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply: stats.fsftTotalSupply,
        decimals: 0,
        peg: "1 FSFT = 1 EUR",
        description: "Minted when a property is acquired",
      },
      eurToken: {
        address: process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "sim",
        symbol: "EURs",
        name: "EUR Stablecoin",
        decimals: 0,
        peg: "1 EURs = €1",
        description: "Private token used to invest in the fund",
      },
      eurBalance: portfolio?.eurBalance ?? 0,
      fsftBalance: portfolio?.balance ?? 0,
      address: address || null,
      source: "simulation",
    });
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { callNodeRpc } = await import("@/lib/aztecClient");

    const tips = await callNodeRpc<{ proposed: { hash: string } }>("node_getL2Tips");
    const bh = tips.proposed.hash;
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";

    const totalSupplyRaw = await callNodeRpc<string>(
      "node_getPublicStorageAt",
      [bh, fundTokenAddr, "0x" + (2n).toString(16).padStart(64, "0")]
    );
    const totalSupply = totalSupplyRaw ? Number(BigInt(totalSupplyRaw)) : 0;

    return NextResponse.json({
      fundToken: {
        address: fundTokenAddr,
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply,
        decimals: 0,
        peg: "1 FSFT = 1 EUR",
        description: "Minted when a property is acquired",
      },
      eurToken: {
        address: eurTokenAddr || "native",
        symbol: "EURs",
        name: "EUR Stablecoin",
        decimals: 0,
        peg: "1 EURs = €1",
        description: "Private token used to invest in the fund",
      },
      eurBalance: await (async () => {
        if (!address || !eurTokenAddr) return 0;
        try {
          const { getTestAccountWallet } = await import("@/lib/serverWallet");
          const { Contract } = await import("@aztec/aztec.js/contracts");
          const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
          const { AztecAddress } = await import("@aztec/aztec.js/addresses");
          const w = await getTestAccountWallet(0);
          const EurJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
          const eurC = await Contract.at(
            AztecAddress.fromString(eurTokenAddr),
            loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]),
            w
          );
          return Number(await eurC.methods.public_balance_of(AztecAddress.fromString(address)).simulate());
        } catch { return 0; }
      })(),
      fsftBalance: 0,
      address: address || null,
      source: "live",
    });
  } catch (error) {
    console.error("[fund/tokens]", error);
    const stats = simGetFundStats();
    return NextResponse.json({
      fundToken: { symbol: "FSFT", totalSupply: stats.fsftTotalSupply },
      eurToken: { symbol: "EURs" },
      source: "simulation",
      fallback: true,
    });
  }
}
