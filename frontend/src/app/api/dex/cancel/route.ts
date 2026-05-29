import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simCancelDexOrder } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

// FSFTDex V3: cancel an order by its public `seq`. We locate the caller's
// private OrderOwnerNote for that seq (in their PXE) and prove it to the
// contract; the public tail checks owner_tag and refunds the unfilled escrow to
// the owner's anonymous claimable (then claim it via /api/dex/claim).
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, orderId, accountIndex = 0 } = body as {
    address?: string; orderId?: number; accountIndex?: number;
  };
  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId (seq) are required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simCancelDexOrder(address, Number(orderId));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: "Order cancelled", source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromString(actor.address);
    const dex = await Contract.at(
      AztecAddress.fromString(dexAddr),
      loadContractArtifact((await loadGeneratedArtifactJson("fsft_dex-FSFTDex.json")) as Parameters<typeof loadContractArtifact>[0]),
      actor.wallet
    );

    // Find the caller's OrderOwnerNote for this seq (read from the owner's scope).
    const mine = simResult<{ len: bigint; storage: { note: { seq: bigint } }[] }>(
      await dex.methods.get_my_orders(from, 0).simulate({ from })
    );
    const hinted = mine.storage.find((h) => Number(h.note.seq) === Number(orderId));
    if (!hinted) {
      return NextResponse.json({ error: `No owned order found for seq ${orderId}.` }, { status: 400 });
    }

    const receipt = await dex.methods.cancel_order(hinted).send({ from });
    return NextResponse.json({
      success: true,
      message: "Order cancelled - unfilled escrow moved to your claimable balance.",
      txHash: requireAztecTxHash(receipt),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/cancel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
