import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simMatchDexOrder } from "@/lib/simulationStore";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { address, orderId, makerOrderId, accountIndex = 0 } = body as {
    address?: string;
    orderId?: number;
    makerOrderId?: number;
    accountIndex?: number;
  };

  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simMatchDexOrder(address, Number(orderId));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: "Order matched", source: "simulation" });
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

    let makerId = makerOrderId;
    if (makerId === undefined) {
      const takerRaw = await dexContract.methods.get_order(Number(orderId)).simulate({ from: actorAddress });
      const taker = Array.isArray(takerRaw) ? takerRaw : [];
      const takerOwner = String(taker[0] ?? "");
      const takerSide = toNumberSafe(taker[1]);
      const takerPrice = toNumberSafe(taker[4]);
      const takerStatus = toNumberSafe(taker[5]);
      if (takerStatus !== 0 && takerStatus !== 1) {
        return NextResponse.json({ error: "Order is not matchable" }, { status: 400 });
      }

      const count = Number(await dexContract.methods.get_order_count().simulate({ from: actorAddress }));
      for (let id = 0; id < count; id += 1) {
        if (id === Number(orderId)) continue;
        const raw = await dexContract.methods.get_order(id).simulate({ from: actorAddress });
        const tuple = Array.isArray(raw) ? raw : [];
        const owner = String(tuple[0] ?? "");
        const side = toNumberSafe(tuple[1]);
        const price = toNumberSafe(tuple[4]);
        const status = toNumberSafe(tuple[5]);
        if (status !== 0 && status !== 1) continue;
        if (!owner || owner.toLowerCase() === takerOwner.toLowerCase()) continue;
        if (side === takerSide) continue;

        const crosses =
          takerSide === 0
            ? takerPrice >= price
            : price >= takerPrice;
        if (!crosses) continue;
        makerId = id;
        break;
      }
    }

    if (makerId === undefined) {
      return NextResponse.json({ error: "No compatible maker order found" }, { status: 400 });
    }

    const receipt = await dexContract.methods
      .match_order(Number(orderId), Number(makerId))
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      message: "Order matched",
      txHash: receipt.txHash?.toString() ?? "unknown",
      source: "live",
      makerOrderId: Number(makerId),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/match]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
