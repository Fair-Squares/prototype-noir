import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetFundStats, simGetPortfolio } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

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
        peg: "Estimated share price",
        description: "Fund share token. Value follows the fund's estimated share price.",
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

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { callNodeRpc } = await import("@/lib/aztecClient");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";

    // FSFT is the vendored AIP-20 Token; total_supply is at slot 8 in its
    // storage layout (name/symbol/decimals/private_balances precede it). The
    // old bespoke FundToken had it at slot 2. See src/artifacts/Token.ts.
    // The total-supply read depends on the L2 tip hash, so it stays a 2-step
    // chain; the per-account balance reads are independent and run alongside
    // it (and each other) in the same batch.
    const [totalSupply, eurBalance, fsftBalance] = await Promise.all([
      (async () => {
        const tips = await callNodeRpc<{ proposed: { hash: string } }>("node_getL2Tips");
        const bh = tips.proposed.hash;
        const totalSupplyRaw = await callNodeRpc<string>(
          "node_getPublicStorageAt",
          [bh, fundTokenAddr, "0x" + BigInt(8).toString(16).padStart(64, "0")]
        );
        return totalSupplyRaw ? Number(BigInt(totalSupplyRaw)) : 0;
      })(),
      // No catch-to-0 here: a failed balance read must surface as the route's
      // 500, never render as a fake €0 / 0 FSFT (repo error-handling rule).
      (async () => {
        if (!address || !eurTokenAddr) return 0;
        const { getTestAccount } = await import("@/lib/serverWallet");
        const { Contract } = await import("@aztec/aztec.js/contracts");
        const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
        const { AztecAddress } = await import("@aztec/aztec.js/addresses");
        const admin = await getTestAccount(0);
        const w = admin.wallet;
        // EUR is an AIP-20 token (vendored standards): balance_of_public.
        const EurJson = await loadGeneratedArtifactJson("token_contract-Token.json");
        const eurC = await Contract.at(
          AztecAddress.fromString(eurTokenAddr),
          loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]),
          w
        );
        return Number(
          simResult(await eurC.methods.balance_of_public(AztecAddress.fromString(address)).simulate({
            from: AztecAddress.fromString(admin.address),
          }))
        );
      })(),
      (async () => {
        if (!address || !fundTokenAddr) return 0;
        const { getTestAccount } = await import("@/lib/serverWallet");
        const { Contract } = await import("@aztec/aztec.js/contracts");
        const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
        const { AztecAddress } = await import("@aztec/aztec.js/addresses");
        const admin = await getTestAccount(0);
        const w = admin.wallet;
        const FtJson = await loadGeneratedArtifactJson("token_contract-Token.json");
        const ftC = await Contract.at(
          AztecAddress.fromString(fundTokenAddr),
          loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]),
          w
        );
        return Number(
          simResult(await ftC.methods.balance_of_public(AztecAddress.fromString(address)).simulate({
            from: AztecAddress.fromString(admin.address),
          }))
        );
      })(),
    ]);

    return NextResponse.json({
      fundToken: {
        address: fundTokenAddr,
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply,
        decimals: 0,
        peg: "Estimated share price",
        description: "Fund share token. Value follows the fund's estimated share price.",
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
      eurBalance,
      fsftBalance,
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
  const { address, accountIndex = 0, amount = 50_000 } = await request.json();

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    // Simulation store already has seeded balances; keep this endpoint as no-op success.
    return NextResponse.json({
      success: true,
      message: `Simulation mode: topped up ${Number(amount).toLocaleString()} EURs`,
      source: "simulation",
    });
  }

  // ── Live mode: drip EURs to the caller via the Dripper faucet ────────────
  // EUR is an AIP-20 token whose minter is the Dripper. drip_to_public mints to
  // the CALLER, so the faucet tx is sent from the user's own account.
  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const dripperAddr = process.env.NEXT_PUBLIC_DRIPPER_ADDRESS ?? "";
    if (!eurTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_EUR_TOKEN_ADDRESS not set" }, { status: 500 });
    }
    if (!dripperAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_DRIPPER_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    // The faucet credits the CALLER, so the selected account must match `address`.
    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const actorAddress = AztecAddress.fromString(actor.address);

    const DripperJson = await loadGeneratedArtifactJson("dripper-Dripper.json");
    const dripperArtifact = loadContractArtifact(DripperJson as Parameters<typeof loadContractArtifact>[0]);
    const dripper = await Contract.at(AztecAddress.fromString(dripperAddr), dripperArtifact, actor.wallet);

    // drip_to_public(token_address: AztecAddress, amount: u64)
    const receipt = await dripper.methods
      .drip_to_public(AztecAddress.fromString(eurTokenAddr), BigInt(Number(amount)))
      .send({ from: actorAddress });
    // A mined drip can still revert (e.g. faucet cap) — inspect the receipt.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        { error: `Drip was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }
    // Avoid logging the funded amount/address together: that ties an identity
    // to a chosen EUR amount in server logs. Log only that a drip succeeded.
    console.info(`[fund/tokens POST] Drip succeeded`);

    return NextResponse.json({
      success: true,
      message: `Dripped ${Number(amount).toLocaleString()} EURs to your account`,
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/tokens POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
