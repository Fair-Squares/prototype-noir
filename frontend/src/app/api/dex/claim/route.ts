import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

// FSFTDex V3: claim the proceeds (and/or refunds) accrued to an order's
// anonymous owner_tag. The owner proves their OrderOwnerNote for `seq`; the DEX
// pays the per-owner_tag claimable balance to a PartialUintNote commitment so no
// recipient address hits public state. `token`: "eur" | "fsft".
const TOKEN = { eur: 0, fsft: 1 } as const;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, orderId, token = "eur", accountIndex = 0 } = body as {
    address?: string; orderId?: number; token?: "eur" | "fsft"; accountIndex?: number;
  };
  if (!address || orderId === undefined) {
    return NextResponse.json({ error: "address and orderId (seq) are required" }, { status: 400 });
  }
  if (token !== "eur" && token !== "fsft") {
    return NextResponse.json({ error: "token must be 'eur' or 'fsft'" }, { status: 400 });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required (claiming settles real private balances)." },
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

    const mine = simResult<{ len: bigint; storage: { note: { seq: bigint } }[] }>(
      await dex.methods.get_my_orders(from, 0).simulate({ from })
    );
    const hinted = mine.storage.find((h) => Number(h.note.seq) === Number(orderId));
    if (!hinted) {
      return NextResponse.json({ error: `No owned order found for seq ${orderId}.` }, { status: 400 });
    }

    const receipt = await dex.methods.claim(hinted, TOKEN[token]).send({ from });
    return NextResponse.json({
      success: true,
      message: `Claimed ${token.toUpperCase()} proceeds to your private balance.`,
      txHash: requireAztecTxHash(receipt),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/claim]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
