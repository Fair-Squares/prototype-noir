import { simResult } from "@/lib/aztecSim";

// Locate the caller's private OrderOwnerNote for a public order `seq`, read from
// their PXE via get_my_orders. Returns the hinted note to thread into
// FSFTDex.cancel_order / claim, or undefined if the caller owns no order with
// that seq. The caller supplies the simulate thunk so this helper stays
// decoupled from the aztec.js Contract/AztecAddress types (which routes import
// dynamically). Shared by /api/dex/cancel and /api/dex/claim.
export async function findOwnedOrderNote(
  getMyOrders: () => Promise<unknown>,
  seq: number
): Promise<{ note: { seq: bigint } } | undefined> {
  const mine = simResult<{ len: bigint; storage: { note: { seq: bigint } }[] }>(
    await getMyOrders()
  );
  return mine.storage.find((h) => Number(h.note.seq) === Number(seq));
}
