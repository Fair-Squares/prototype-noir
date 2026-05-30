import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simResult } from "@/lib/aztecSim";

// FSFTDex V3: scan the CALLER's own orders from their PXE (get_my_orders) and
// enrich each with its public state (get_order) + the proceeds/refund accrued to
// its anonymous owner_tag (get_claimable). The `seq` is internal plumbing the
// owner_tag is derived from — it is returned so cancel/claim can reference an
// order, but the UI never asks the user to know or type it.
//
// owner_tag = poseidon2([secret_owner_key, seq]) — same derivation the contract
// uses, so we can read the per-tag claimable counters without revealing identity.

const SIDE = ["buy", "sell"] as const;
const STATUS = ["open", "partial", "filled", "cancelled", "expired"] as const;

function toNum(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function toBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt((value as { toString: () => string }).toString());
  }
  return 0n;
}

interface RawOrder {
  seq: bigint; side: bigint; price_bps: bigint; amount: bigint;
  remaining: bigint; status: bigint; expiry_block: bigint; escrow_token: bigint;
}
interface OwnerNote {
  note: { owner: string; secret_owner_key: bigint | string; seq: bigint };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  if (!isLiveModeEnabled()) {
    // No live chain → the caller has no scannable private orders.
    return NextResponse.json({ orders: [], source: "unavailable" });
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { Fr } = await import("@aztec/aztec.js/fields");
    const { loadArtifact } = await import("@/lib/artifactLoader");
    const { poseidon2Hash } = await import("@aztec/foundation/crypto/poseidon");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromString(actor.address);
    const dex = await Contract.at(AztecAddress.fromString(dexAddr), await loadArtifact("fsft_dex-FSFTDex.json"), actor.wallet);

    // 1. Scan the caller's own OrderOwnerNotes (from their PXE).
    const mine = simResult<{ len: bigint; storage: OwnerNote[] }>(
      await dex.methods.get_my_orders(from, 0).simulate({ from })
    );
    const notes = mine.storage.slice(0, Number(mine.len));
    if (notes.length === 0) return NextResponse.json({ orders: [], source: "live" });

    // 2. For each owned order: read its public state + the claimable accrued to
    //    its owner_tag. All independent → one parallel batch.
    const orders = await Promise.all(
      notes.map(async (h) => {
        const seq = Number(toBig(h.note.seq));
        const secret = Fr.fromString(
          typeof h.note.secret_owner_key === "string"
            ? h.note.secret_owner_key
            : "0x" + toBig(h.note.secret_owner_key).toString(16)
        );
        const ownerTag = await poseidon2Hash([secret, new Fr(BigInt(seq))]);
        const [orderRaw, claimableRaw] = await Promise.all([
          dex.methods.get_order(seq).simulate({ from }).then((r) => simResult<RawOrder>(r)),
          dex.methods.get_claimable(ownerTag).simulate({ from }).then((r) =>
            simResult<{ fsft: bigint; eur: bigint }>(r)
          ),
        ]);
        const status = STATUS[toNum(orderRaw.status)] ?? "open";
        return {
          seq,
          side: SIDE[toNum(orderRaw.side)] ?? "buy",
          amount: toNum(orderRaw.amount),
          remaining: toNum(orderRaw.remaining),
          priceEur: toNum(orderRaw.price_bps) / 10000,
          status,
          expiryBlock: toNum(orderRaw.expiry_block),
          claimableEur: toNum(claimableRaw.eur),
          claimableFsft: toNum(claimableRaw.fsft),
          // True when there is unfilled escrow that cancelling would refund.
          cancellable: (status === "open" || status === "partial") && toNum(orderRaw.remaining) > 0,
        };
      })
    );

    // Newest first (highest seq).
    orders.sort((a, b) => b.seq - a.seq);
    return NextResponse.json({ orders, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/my-orders]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
