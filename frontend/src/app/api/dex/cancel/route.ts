import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simCancelDexOrder } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";

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

  if (!isLiveModeEnabled()) {
    const result = simCancelDexOrder(address, Number(orderId));
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: "Order cancelled", source: "simulation" });
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadArtifact } = await import("@/lib/artifactLoader");
    const { findOwnedOrderNote } = await import("@/lib/dexNotes");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromString(actor.address);
    const dex = await Contract.at(
      AztecAddress.fromString(dexAddr),
      await loadArtifact("fsft_dex-FSFTDex.json"),
      actor.wallet
    );

    // Find the caller's OrderOwnerNote for this seq (read from the owner's scope).
    const hinted = await findOwnedOrderNote(
      () => dex.methods.get_my_orders(from, 0).simulate({ from }),
      Number(orderId)
    );
    if (!hinted) {
      return NextResponse.json({ error: `No owned order found for seq ${orderId}.` }, { status: 400 });
    }

    const receipt = await dex.methods.cancel_order(hinted).send({ from });
    // A mined cancel can still revert in the public leg (order already filled
    // or expired-and-refunded) — inspect the receipt.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        { error: `Cancel was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      message: "Order cancelled - unfilled escrow moved to your claimable balance.",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/cancel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
