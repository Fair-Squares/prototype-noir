import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetDexOrderbook, simPlaceDexOrder } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
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

interface OrderInfoStruct {
  owner: unknown;
  side: bigint;
  amount: bigint;
  remaining: bigint;
  price_bps: bigint;
  status: bigint;
  expiry_block: bigint;
  created_block: bigint;
}

function statusToLabel(status: number): "open" | "partial" | "filled" | "cancelled" | "expired" {
  if (status === 0) return "open";
  if (status === 1) return "partial";
  if (status === 2) return "filled";
  if (status === 3) return "cancelled";
  if (status === 4) return "expired";
  throw new Error(`Invalid DEX order status code: ${status}`);
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

    const [countSim, snapshotSim] = await Promise.all([
      dexContract.methods.get_order_count().simulate({ from: actorAddress }),
      dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress }),
    ]);

    const count = toNumberStrict(simResult(countSim), "FSFTDex.get_order_count");
    const snapshot = simResult<{ ref_price_bps: bigint; min_price_bps: bigint; max_price_bps: bigint }>(snapshotSim);
    const referenceBps = toNumberStrict(snapshot.ref_price_bps, "FSFTDex.get_orderbook_snapshot.ref_price_bps");
    const minBps = toNumberStrict(snapshot.min_price_bps, "FSFTDex.get_orderbook_snapshot.min_price_bps");
    const maxBps = toNumberStrict(snapshot.max_price_bps, "FSFTDex.get_orderbook_snapshot.max_price_bps");

    const rawOrders = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const order = simResult<OrderInfoStruct>(
          await dexContract.methods.get_order(id).simulate({ from: actorAddress })
        );
        return { id, order };
      })
    );

    const orders = rawOrders.map(({ id, order }) => {
      const ownerValue = order.owner;
      if (ownerValue === undefined || ownerValue === null) {
        throw new Error(`FSFTDex.get_order(${id}) returned empty owner`);
      }
      const owner = String(ownerValue);
      const sideCode = toNumberStrict(order.side, `FSFTDex.get_order(${id}).side`);
      if (sideCode !== 0 && sideCode !== 1) {
        throw new Error(`FSFTDex.get_order(${id}) returned invalid side code ${sideCode}`);
      }
      const side = sideCode === 0 ? "buy" : "sell";
      const amount = toNumberStrict(order.amount, `FSFTDex.get_order(${id}).amount`);
      const remaining = toNumberStrict(order.remaining, `FSFTDex.get_order(${id}).remaining`);
      const priceBps = toNumberStrict(order.price_bps, `FSFTDex.get_order(${id}).price_bps`);
      const statusCode = toNumberStrict(order.status, `FSFTDex.get_order(${id}).status`);
      const expiryBlock = toNumberStrict(order.expiry_block, `FSFTDex.get_order(${id}).expiry_block`);
      const createdAt = toNumberStrict(order.created_block, `FSFTDex.get_order(${id}).created_block`);

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
  const body = await request.json();
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

    const snapshot = simResult<{ ref_price_bps: bigint }>(
      await dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress })
    );
    const referenceBps = toNumberStrict(snapshot.ref_price_bps, "FSFTDex.get_orderbook_snapshot.ref_price_bps");
    if (referenceBps <= 0) {
      throw new Error("FSFTDex.get_orderbook_snapshot returned non-positive reference price");
    }
    const priceBps = limitPriceEur ? Math.round(Number(limitPriceEur) * 10_000) : referenceBps;

    const sideCode = side === "buy" ? 0 : 1;
    const ttl = Number(ttlBlocks ?? process.env.DEX_MAX_TTL_BLOCKS ?? 120);
    const receipt = await dexContract.methods
      .place_order(sideCode, BigInt(Math.round(Number(amount))), BigInt(priceBps), ttl)
      .send({ from: actorAddress });

    const countAfter = Number(simResult(await dexContract.methods.get_order_count().simulate({ from: actorAddress })));
    const newOrderId = Math.max(0, countAfter - 1);

    return NextResponse.json({
      success: true,
      orderId: newOrderId,
      message: "Order placed",
      txHash: requireAztecTxHash(receipt),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/orders POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
