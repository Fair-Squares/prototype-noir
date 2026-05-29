import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetDexOrderbook, simPlaceDexOrder } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";
import { getBlockNumber } from "@/lib/aztecClient";

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

// Phase 3: the FSFTDex V1 public orderbook is RETIRED. The contract no longer
// exposes per-order maps (`get_order` / `get_order_count` are GONE) — orders now
// live as private OrderIntentNotes in each owner's PXE and the chain only reveals
// an application-level commitment + its status (OPEN / PARTIAL / FILLED /
// CANCELLED) via `get_order_status(commitment)`. There is therefore NO public
// enumeration of the orderbook: the snapshot below carries only the advisory
// NAV band + ttl policy, and the buy/sell/user lists are intentionally empty.
// Callers track a specific order by retaining the commitment returned from POST
// and polling `get_order_status` (not surfaced here — it requires the caller's
// own commitment, which is not derivable from public state).

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

    // V2 snapshot only carries the advisory NAV band + ttl policy. `order_count`
    // was dropped along with the public orderbook.
    const snapshot = simResult<{
      ref_price_bps: bigint;
      min_price_bps: bigint;
      max_price_bps: bigint;
      price_band_bps: bigint;
      max_ttl_blocks: bigint;
    }>(await dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress }));
    const referenceBps = toNumberStrict(snapshot.ref_price_bps, "FSFTDex.get_orderbook_snapshot.ref_price_bps");
    const minBps = toNumberStrict(snapshot.min_price_bps, "FSFTDex.get_orderbook_snapshot.min_price_bps");
    const maxBps = toNumberStrict(snapshot.max_price_bps, "FSFTDex.get_orderbook_snapshot.max_price_bps");
    const priceBandBps = toNumberStrict(snapshot.price_band_bps, "FSFTDex.get_orderbook_snapshot.price_band_bps");
    const maxTtlBlocks = toNumberStrict(snapshot.max_ttl_blocks, "FSFTDex.get_orderbook_snapshot.max_ttl_blocks");

    return NextResponse.json({
      priceReferenceEur: referenceBps / 10000,
      priceBandMinEur: minBps / 10000,
      priceBandMaxEur: maxBps / 10000,
      priceBandBps,
      maxTtlBlocks,
      // Per-order public listing is not available under the V2 private-intents
      // model: order owner / amount / price never leave the owner's PXE, so the
      // orderbook cannot be enumerated on chain.
      buyOrders: [],
      sellOrders: [],
      userOrders: [],
      recentTrades: [],
      orderbookListingAvailable: false,
      note:
        "Per-order public listing is unavailable under the private-intents model. " +
        "Only the NAV band/ttl snapshot is public; track your own order via the " +
        "commitment returned when placing it.",
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
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    if (!kycAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { Fr } = await import("@aztec/aztec.js/fields");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const actorAddress = AztecAddress.fromString(actor.address);
    const DexArtifactJson = await loadGeneratedArtifactJson("fsft_dex-FSFTDex.json");
    const dexArtifact = loadContractArtifact(DexArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const dexContract = await Contract.at(AztecAddress.fromString(dexAddr), dexArtifact, actor.wallet);

    const snapshot = simResult<{ ref_price_bps: bigint; max_ttl_blocks: bigint }>(
      await dexContract.methods.get_orderbook_snapshot().simulate({ from: actorAddress })
    );
    const referenceBps = toNumberStrict(snapshot.ref_price_bps, "FSFTDex.get_orderbook_snapshot.ref_price_bps");
    if (referenceBps <= 0) {
      throw new Error("FSFTDex.get_orderbook_snapshot returned non-positive reference price");
    }
    const maxTtlBlocks = toNumberStrict(snapshot.max_ttl_blocks, "FSFTDex.get_orderbook_snapshot.max_ttl_blocks");
    const priceBps = limitPriceEur ? Math.round(Number(limitPriceEur) * 10_000) : referenceBps;

    // V2 place_order_private requires the caller's KYC credential note as a hint.
    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, actor.wallet);
    const credentialsResult = simResult<{ len: bigint; storage: unknown[] }>(
      await kycContract.methods.get_my_kyc_credentials(actorAddress, 0).simulate({ from: actorAddress })
    );
    if (credentialsResult.len === 0n) {
      return NextResponse.json(
        {
          error:
            "No private KYC credential found for this account. Complete KYC (POST /api/kyc/register) before placing orders.",
        },
        { status: 403 }
      );
    }
    const hintedKycNote = credentialsResult.storage[0];

    // Expiry is an absolute block height: current head + the requested ttl,
    // clamped to the contract's advisory max_ttl_blocks policy.
    const ttl = Math.min(Number(ttlBlocks ?? process.env.DEX_MAX_TTL_BLOCKS ?? 120), maxTtlBlocks);
    const currentBlock = await getBlockNumber();
    const expiryBlock = currentBlock + ttl;

    const sideCode = side === "buy" ? 0 : 1;
    const amountU128 = BigInt(Math.round(Number(amount)));
    // Random salt so distinct orders with identical (owner, side, amount, price,
    // expiry) parameters produce distinct public commitments.
    const salt = Fr.random();

    const receipt = await dexContract.methods
      .place_order_private(sideCode, amountU128, BigInt(priceBps), expiryBlock, salt, hintedKycNote)
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      // The application-level order commitment the caller retains to look up
      // status later via FSFTDex.get_order_status(commitment).
      salt: salt.toString(),
      side,
      amount: Number(amountU128),
      priceBps,
      expiryBlock,
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
