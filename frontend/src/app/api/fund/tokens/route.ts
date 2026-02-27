import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetFundStats, simGetPortfolio } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const stats = simGetFundStats();
    const portfolio = address ? simGetPortfolio(address) : null;

    return NextResponse.json({
      fundToken: {
        address: process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "sim",
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply: stats.fsftTotalSupply,
        decimals: 0,
        peg: "NAV-based share value",
        description: "Fund share token. Issue price may start near €1 at settlement; ongoing value tracks NAV per FSFT.",
      },
      eurToken: {
        address: process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "sim",
        symbol: "EURs",
        name: "EUR Stablecoin",
        decimals: 0,
        peg: "1 EURs = €1",
        description: "Private token used to invest in the fund",
      },
      protocolToken: {
        address: process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "sim",
        symbol: "FSP",
        name: "Fair Squares Protocol Token",
        decimals: 0,
        distribution: "8M over 10 years",
        description: "Protocol token distributed for deposits, governance participation, and FSFT holder activity.",
      },
      eurBalance: portfolio?.eurBalance ?? 0,
      fsftBalance: portfolio?.balance ?? 0,
      protocolBalance: portfolio?.protocolTokenBalance ?? 0,
      address: address || null,
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { callNodeRpc } = await import("@/lib/aztecClient");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const tips = await callNodeRpc<{ proposed: { hash: string } }>("node_getL2Tips");
    const bh = tips.proposed.hash;
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";

    const totalSupplyRaw = await callNodeRpc<string>(
      "node_getPublicStorageAt",
      [bh, fundTokenAddr, "0x" + BigInt(2).toString(16).padStart(64, "0")]
    );
    const totalSupply = totalSupplyRaw ? Number(BigInt(totalSupplyRaw)) : 0;

    return NextResponse.json({
      fundToken: {
        address: fundTokenAddr,
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply,
        decimals: 0,
        peg: "NAV-based share value",
        description: "Fund share token. Issue price may start near €1 at settlement; ongoing value tracks NAV per FSFT.",
      },
      eurToken: {
        address: eurTokenAddr || "native",
        symbol: "EURs",
        name: "EUR Stablecoin",
        decimals: 0,
        peg: "1 EURs = €1",
        description: "Private token used to invest in the fund",
      },
      protocolToken: {
        address: process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "",
        symbol: "FSP",
        name: "Fair Squares Protocol Token",
        decimals: 0,
        distribution: "8M over 10 years",
        description: "Protocol token distributed for deposits, governance participation, and FSFT holder activity.",
      },
      eurBalance: await (async () => {
        if (!address || !eurTokenAddr) return 0;
        try {
          const { getTestAccount } = await import("@/lib/serverWallet");
          const { Contract } = await import("@aztec/aztec.js/contracts");
          const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
          const { AztecAddress } = await import("@aztec/aztec.js/addresses");
          const admin = await getTestAccount(0);
          const w = admin.wallet;
          const EurJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
          const eurC = await Contract.at(
            AztecAddress.fromString(eurTokenAddr),
            loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]),
            w
          );
          return Number(
            await eurC.methods.public_balance_of(AztecAddress.fromString(address)).simulate({
              from: AztecAddress.fromString(admin.address),
            })
          );
        } catch { return 0; }
      })(),
      fsftBalance: await (async () => {
        if (!address || !fundTokenAddr) return 0;
        try {
          const { getTestAccount } = await import("@/lib/serverWallet");
          const { Contract } = await import("@aztec/aztec.js/contracts");
          const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
          const { AztecAddress } = await import("@aztec/aztec.js/addresses");
          const admin = await getTestAccount(0);
          const w = admin.wallet;
          const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
          const ftC = await Contract.at(
            AztecAddress.fromString(fundTokenAddr),
            loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]),
            w
          );
          return Number(
            await ftC.methods.public_balance_of(AztecAddress.fromString(address)).simulate({
              from: AztecAddress.fromString(admin.address),
            })
          );
        } catch { return 0; }
      })(),
      protocolBalance: 0,
      address: address || null,
      source: "live",
    });
  } catch (error) {
    console.error("[fund/tokens]", error);
    return NextResponse.json({ error: "Failed to read live token info" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount = 50_000 } = await request.json().catch(() => ({}));

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    // Simulation store already has seeded balances; keep this endpoint as no-op success.
    return NextResponse.json({
      success: true,
      message: `Simulation mode: topped up ${Number(amount).toLocaleString()} EURs`,
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: mint EURs to selected address via admin wallet ───────────
  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    if (!eurTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_EUR_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    // test0/admin is the EUR token admin in bootstrap script.
    const admin = await getTestAccount(0);
    void accountIndex; // target account is identified by `address`; admin signs mint.

    const EurJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
    const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
    const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, admin.wallet);

    const receipt = await eurContract.methods
      .mint_public(AztecAddress.fromString(address), BigInt(Number(amount)))
      .send({ from: AztecAddress.fromString(admin.address) });
    console.info(`[fund/tokens POST] Minted ${Number(amount)} EURs to ${address} from admin ${admin.address}`);

    return NextResponse.json({
      success: true,
      message: `Topped up ${Number(amount).toLocaleString()} EURs to ${address}`,
      txHash: receipt.txHash?.toString() ?? "unknown",
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/tokens POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
