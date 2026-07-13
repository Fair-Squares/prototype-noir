import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetDexOrderbook, simPlaceDexOrder } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";
import { getBlockNumber } from "@/lib/aztecClient";

// FSFTDex V3 — anonymous LIT order book. The book is PUBLIC (no owner on chain),
// so GET enumerates real resting orders. Matching is ON-CHAIN inside place_order:
// the placement tx escrows funds into the DEX and settles against the crossing
// resting orders we reference (exact-price). No keeper script.
const MAX_FILLS = 4;
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

interface RawOrder {
  seq: bigint; side: bigint; price_bps: bigint; amount: bigint;
  remaining: bigint; status: bigint; expiry_block: bigint; escrow_token: bigint;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? undefined;
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetDexOrderbook(address));
  }

  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    if (!dexAddr) return NextResponse.json({ error: "NEXT_PUBLIC_FSFT_DEX_ADDRESS not set" }, { status: 500 });

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadArtifact } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    const from = AztecAddress.fromString(actor.address);
    const dexArtifact = await loadArtifact("fsft_dex-FSFTDex.json");
    const dex = await Contract.at(AztecAddress.fromString(dexAddr), dexArtifact, actor.wallet);

    const snapshot = simResult<{
      ref_price_bps: bigint; min_price_bps: bigint; max_price_bps: bigint;
      price_band_bps: bigint; max_ttl_blocks: bigint; order_count: bigint;
    }>(await dex.methods.get_orderbook_snapshot().simulate({ from }));
    const count = toNum(snapshot.order_count);

    // Read the public book (one get_order per seq). Bounded by order_count.
    const orders = await Promise.all(
      Array.from({ length: count }, (_, seq) =>
        dex.methods.get_order(seq).simulate({ from }).then((r) => simResult<RawOrder>(r))
      )
    );
    const view = orders.map((o) => ({
      id: toNum(o.seq),
      side: toNum(o.side) === 0 ? ("buy" as const) : ("sell" as const),
      amount: toNum(o.amount),
      remaining: toNum(o.remaining),
      priceEur: toNum(o.price_bps) / 10000,
      status: STATUS[toNum(o.status)] ?? "open",
      createdAt: toNum(o.seq),
      updatedAt: toNum(o.seq),
      expiryBlock: toNum(o.expiry_block),
    }));
    const active = view.filter((o) => o.status === "open" || o.status === "partial");

    return NextResponse.json({
      priceReferenceEur: toNum(snapshot.ref_price_bps) / 10000,
      priceBandMinEur: toNum(snapshot.min_price_bps) / 10000,
      priceBandMaxEur: toNum(snapshot.max_price_bps) / 10000,
      priceBandBps: toNum(snapshot.price_band_bps),
      maxTtlBlocks: toNum(snapshot.max_ttl_blocks),
      orderCount: count,
      buyOrders: active.filter((o) => o.side === "buy").sort((a, b) => b.priceEur - a.priceEur),
      sellOrders: active.filter((o) => o.side === "sell").sort((a, b) => a.priceEur - b.priceEur),
      // Public book, but the OWNER of each order is hidden on chain — a caller's
      // own orders are read from their PXE via get_my_orders, not from this list.
      userOrders: [],
      recentTrades: [],
      orderbookListingAvailable: true,
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
    address?: string; side?: "buy" | "sell"; amount?: number;
    limitPriceEur?: number; accountIndex?: number; ttlBlocks?: number;
  };

  if (!address || !side || !amount) {
    return NextResponse.json({ error: "address, side and amount are required" }, { status: 400 });
  }
  // The DEX enforces a TTL risk policy on placement (0 < ttl <= max_ttl_blocks).
  // The clamp below handles the upper bound; reject a nonsensical explicit TTL
  // here instead of letting Math.min(0, max) send a guaranteed revert.
  if (ttlBlocks !== undefined && (!Number.isInteger(ttlBlocks) || ttlBlocks <= 0)) {
    return NextResponse.json({ error: "ttlBlocks must be a positive integer when provided" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    const result = simPlaceDexOrder(address, side, Number(amount), limitPriceEur ? Number(limitPriceEur) : undefined);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, order: result.order, message: "Order placed", source: "simulation" });
  }

  // Tracks any public->private shield self-transfer that commits as a separate
  // tx before place_order, so the catch can tell the caller the shield landed
  // even when placement reverts. Declared here so it's in scope for the catch.
  let shieldedAmount = 0n;
  try {
    const dexAddr = process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "";
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const fsftAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const eurAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    if (!dexAddr || !kycAddr || !fsftAddr || !eurAddr) {
      return NextResponse.json({ error: "DEX/KYC/token addresses not configured" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { Fr } = await import("@aztec/aztec.js/fields");
    const { loadArtifact } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromString(actor.address);
    const dexAddress = AztecAddress.fromString(dexAddr);

    const [dexArtifact, tokenArtifact, kycArtifact] = await Promise.all([
      loadArtifact("fsft_dex-FSFTDex.json"),
      loadArtifact("token_contract-Token.json"),
      loadArtifact("kyc_verifier-KYCVerifier.json"),
    ]);
    const dex = await Contract.at(dexAddress, dexArtifact, actor.wallet);
    const kyc = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, actor.wallet);

    const snapshot = simResult<{ ref_price_bps: bigint; max_ttl_blocks: bigint; order_count: bigint }>(
      await dex.methods.get_orderbook_snapshot().simulate({ from })
    );
    const referenceBps = toNum(snapshot.ref_price_bps);
    if (referenceBps <= 0) throw new Error("non-positive NAV reference price");
    const priceBps = limitPriceEur ? Math.round(Number(limitPriceEur) * 10_000) : referenceBps;
    const sideCode = side === "buy" ? 0 : 1;
    const amountU128 = BigInt(Math.round(Number(amount)));

    // KYC credential note (proven privately inside place_order).
    const creds = simResult<{ len: bigint; storage: unknown[] }>(
      await kyc.methods.get_my_kyc_credentials(from, 0).simulate({ from })
    );
    if (creds.len === 0n) {
      return NextResponse.json(
        { error: "No KYC credential for this account. Complete KYC before placing orders." },
        { status: 403 }
      );
    }
    const hintedKycNote = creds.storage[0];

    const suppliedSeq = toNum(snapshot.order_count); // seq_counter == order_count
    const currentBlock = await getBlockNumber();

    // Scan the public book for crossing EXACT-price, opposite-side, active,
    // unexpired, strictly-older orders the placement will match on-chain.
    const wantSide = sideCode === 0 ? 1 : 0; // buy matches sells, sell matches buys
    // Read the whole book in parallel, then take the crossing candidates in seq
    // order (oldest first) up to MAX_FILLS — same selection as a serial scan,
    // but one batched round-trip instead of N sequential ones.
    const book = await Promise.all(
      Array.from({ length: suppliedSeq }, (_, seq) =>
        dex.methods.get_order(seq).simulate({ from }).then((r) => simResult<RawOrder>(r))
      )
    );
    const candidates = book
      .filter((o) => {
        const status = toNum(o.status);
        return (
          toNum(o.side) === wantSide &&
          (status === 0 || status === 1) &&
          toNum(o.price_bps) === priceBps &&
          toNum(o.expiry_block) > currentBlock &&
          toNum(o.remaining) > 0
        );
      })
      .map((o) => toNum(o.seq))
      .slice(0, MAX_FILLS);
    const makerSeqs = Array.from({ length: MAX_FILLS }, (_, i) => BigInt(candidates[i] ?? 0));
    const matchCount = candidates.length;

    // Escrow: SELL locks `amount` FSFT; BUY locks floor(amount*price/10000) EUR.
    // Build the one authwit the placement's escrow leg consumes.
    const escrowTokenAddr = sideCode === 1 ? AztecAddress.fromString(fsftAddr) : AztecAddress.fromString(eurAddr);
    const escrowAmount = sideCode === 1 ? amountU128 : (amountU128 * BigInt(priceBps)) / 10000n;
    const escrowNonce = Fr.random();
    const token = await Contract.at(escrowTokenAddr, tokenArtifact, actor.wallet);

    // A BUY escrows the buyer's PRIVATE EUR (the transfer_private_to_public
    // below). If their private balance is short, shield the shortfall from their
    // public balance first — a self public->private transfer that doesn't leak
    // the order — so buying "just works" from any EUR balance. (A SELL escrows
    // private FSFT, which the seller already holds, so no shielding is needed.)
    // Track whether a shield self-transfer ran: it's a separate tx that commits
    // before place_order. If placement later reverts, the shielded EUR stays in
    // the buyer's PRIVATE balance (a recoverable self-transfer, not a loss), but
    // the caller should be told their public->private move did land so they
    // aren't surprised by the balance shift.
    if (sideCode === 0) {
      const privateEur = BigInt(
        toNum(simResult(await token.methods.balance_of_private(from).simulate({ from })))
      );
      if (privateEur < escrowAmount) {
        shieldedAmount = escrowAmount - privateEur;
        const shieldReceipt = await token.methods
          .transfer_public_to_private(from, from, shieldedAmount, 0)
          .send({ from });
        // The shield is a separate committed tx; if it reverted, the private
        // balance the placement is about to escrow does not exist — stop here
        // rather than let place_order fail confusingly downstream.
        const shieldOutcome = getAztecTxOutcome(shieldReceipt);
        if (shieldOutcome.reverted) {
          return NextResponse.json(
            { error: `EUR shield transfer was mined but reverted on-chain: ${shieldOutcome.error ?? "no revert reason in receipt"}` },
            { status: 409 }
          );
        }
      }
    }

    const escrowCall = await token.methods
      .transfer_private_to_public(from, dexAddress, escrowAmount, escrowNonce)
      .getFunctionCall();
    const escrowAuthwit = await actor.wallet.createAuthWit(from, { caller: dexAddress, call: escrowCall });

    const secretOwnerKey = Fr.random();
    const ttl = Math.min(Number(ttlBlocks ?? process.env.DEX_MAX_TTL_BLOCKS ?? 120), toNum(snapshot.max_ttl_blocks));

    const receipt = await dex.methods
      .place_order(
        sideCode,
        amountU128,
        BigInt(priceBps),
        ttl,
        secretOwnerKey,
        BigInt(suppliedSeq),
        escrowNonce,
        matchCount,
        makerSeqs,
        0, // policy: exact-price
        hintedKycNote
      )
      .send({ from, authWitnesses: [escrowAuthwit] });

    // A mined placement can still revert in the public matcher tail (stale seq
    // under a concurrent placement, TTL/band policy) — the escrow rides in the
    // same tx so it reverts with it; report the failure, never a phantom order.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        {
          error: `Order was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}`,
          // The shield self-transfer (if any) committed separately and is NOT
          // rolled back — the EUR sits in the caller's private balance.
          shieldedAmount: shieldedAmount > 0n ? Number(shieldedAmount) : 0,
        },
        { status: 409 }
      );
    }

    // SECURITY (M17): never return `secretOwnerKey`. It is the pre-image of the
    // anonymous owner tag (`owner_tag = poseidon2([secret, seq])`). Because `seq`
    // is public, leaking the secret lets anyone recompute the tag and read the
    // order owner's claimable balances via the unauthenticated `get_claimable`.
    // No client consumes it, so it stays server-side only.
    return NextResponse.json({
      success: true,
      seq: suppliedSeq,
      side,
      amount: Number(amountU128),
      priceBps,
      matched: matchCount,
      message:
        matchCount > 0
          ? `Order placed and matched ${matchCount} resting order(s) on-chain.`
          : "Order placed — resting in the book until a crossing order matches it.",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/orders POST]", msg);
    // If a shield self-transfer already committed before placement failed, the
    // EUR moved from the buyer's public to private balance (recoverable, not
    // lost). Surface that so the UI can explain the balance shift.
    if (shieldedAmount > 0n) {
      return NextResponse.json(
        {
          error: msg,
          shielded: {
            amount: Number(shieldedAmount),
            notice:
              "A separate public->private EUR transfer committed before the order failed. " +
              "Those funds are now in your private EUR balance (recoverable); no EUR was lost.",
          },
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
