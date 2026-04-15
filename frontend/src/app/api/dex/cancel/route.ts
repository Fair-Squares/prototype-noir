import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simCancelDexOrder } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, orderId, accountIndex = 0 } = body as {
    address?: string;
    orderId?: number;
    accountIndex?: number;
  };

  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId are required" }, { status: 400 });
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

    const receipt = await dexContract.methods.cancel_order(Number(orderId)).send({ from: actorAddress });
    return NextResponse.json({
      success: true,
      message: "Order cancelled",
      txHash: (() => { const txHash = receipt.txHash?.toString(); if (!txHash) { throw new Error("Transaction receipt missing txHash"); } return txHash; })(),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/cancel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
