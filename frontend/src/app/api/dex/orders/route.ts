import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetDexOrderbook, simPlaceDexOrder } from "@/lib/simulationStore";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function statusToLabel(status: number): "open" | "partial" | "filled" | "cancelled" | "expired" {
  if (status === 0) return "open";
  if (status === 1) return "partial";
  if (status === 2) return "filled";
  if (status === 3) return "cancelled";
  return "expired";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? undefined;
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetDexOrderbook(address));
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    const actorAddress = AztecAddress.fromString(actor.address);

    const DexArtifactJson = await loadGeneratedArtifactJson("fsft_dex-FSFTDex.json");
    const dexArtifact = loadContractArtifact(DexArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const dexContract = await Contract.at(AztecAddress.fromString(dexAddr), dexArtifact, actor.wallet);

    const [countRaw, snapshotRaw] = await Promise.all([
      dexContract.methods.get_order_count().simulate({ from: actorAddress }),
      dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress }),
    ]);

    const count = Number(countRaw);
    const snapshot = Array.isArray(snapshotRaw) ? snapshotRaw : [10_000, 9800, 10_200];
    const referenceBps = toNumberSafe(snapshot[0]);
    const minBps = toNumberSafe(snapshot[1]);
    const maxBps = toNumberSafe(snapshot[2]);

    const rawOrders = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const orderRaw = await dexContract.methods.get_order(id).simulate({ from: actorAddress });
        return { id, tuple: Array.isArray(orderRaw) ? orderRaw : [] };
      })
    );

    const orders = rawOrders.map(({ id, tuple }) => {
      const owner = tuple[0] ? String(tuple[0]) : "0x0";
      const sideCode = toNumberSafe(tuple[1]);
      const side = sideCode === 0 ? "buy" : "sell";
      const amount = toNumberSafe(tuple[2]);
      const remaining = toNumberSafe(tuple[3]);
      const priceBps = toNumberSafe(tuple[4]);
      const statusCode = toNumberSafe(tuple[5]);
      const expiryBlock = toNumberSafe(tuple[6]);
      const createdAt = toNumberSafe(tuple[7]);

      return {
        id,
        side,
        owner,
        amount,
        remaining,
        priceEur: priceBps / 10000,
        status: statusToLabel(statusCode),
        createdAt,
        updatedAt: createdAt,
        expiryBlock,
      };
    });

    const openOrders = orders.filter((o) => o.status === "open" || o.status === "partial");
    const buyOrders = openOrders
      .filter((o) => o.side === "buy")
      .sort((a, b) => b.priceEur - a.priceEur || a.createdAt - b.createdAt);
    const sellOrders = openOrders
      .filter((o) => o.side === "sell")
      .sort((a, b) => a.priceEur - b.priceEur || a.createdAt - b.createdAt);

    return NextResponse.json({
      priceReferenceEur: referenceBps / 10000,
      priceBandMinEur: minBps / 10000,
      priceBandMaxEur: maxBps / 10000,
      buyOrders,
      sellOrders,
      userOrders: address ? orders.filter((o) => o.owner.toLowerCase() === address.toLowerCase()) : [],
      recentTrades: [],
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/orders GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { address, side, amount, limitPriceEur, accountIndex = 0, ttlBlocks } = body as {
    address?: string;
    side?: "buy" | "sell";
    amount?: number;
    limitPriceEur?: number;
    accountIndex?: number;
    ttlBlocks?: number;
  };

  if (!address || !side || !amount) {
    return NextResponse.json({ error: "address, side and amount are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simPlaceDexOrder(address, side, Number(amount), limitPriceEur ? Number(limitPriceEur) : undefined);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      order: result.order,
      message: "Order placed",
      source: "simulation",
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const actorAddress = AztecAddress.fromString(actor.address);
    const DexArtifactJson = await loadGeneratedArtifactJson("fsft_dex-FSFTDex.json");
    const dexArtifact = loadContractArtifact(DexArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const dexContract = await Contract.at(AztecAddress.fromString(dexAddr), dexArtifact, actor.wallet);

    const snapshotRaw = await dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress });
    const snapshot = Array.isArray(snapshotRaw) ? snapshotRaw : [10_000];
    const referenceBps = toNumberSafe(snapshot[0]) || 10_000;
    const priceBps = limitPriceEur ? Math.round(Number(limitPriceEur) * 10_000) : referenceBps;

    const sideCode = side === "buy" ? 0 : 1;
    const ttl = Number(ttlBlocks ?? process.env.DEX_MAX_TTL_BLOCKS ?? 120);
    const receipt = await dexContract.methods
      .place_order(sideCode, BigInt(Math.round(Number(amount))), BigInt(priceBps), ttl)
      .send({ from: actorAddress });

    const countAfter = Number(await dexContract.methods.get_order_count().simulate({ from: actorAddress }));
    const newOrderId = Math.max(0, countAfter - 1);

    return NextResponse.json({
      success: true,
      orderId: newOrderId,
      message: "Order placed",
      txHash: receipt.txHash?.toString() ?? "unknown",
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/orders POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
