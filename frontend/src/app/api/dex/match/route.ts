import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simMatchDexOrder } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

// Phase 3: DEX settlement migrated to the vendored AIP-20 `Token`. The V1 public
// orderbook + `match_order` (which settled via the bespoke FundToken delegated
// spender) are RETIRED. Matching now goes through the V2 private flow:
//
//   match_order_private(hinted_taker_intent, hinted_maker_intent, fill_amount,
//                       taker_authwit_nonce, maker_authwit_nonce)
//
// which settles atomically across both legs via the vendored Token's
// `transfer_private_to_private(from, to, amount: u128, _nonce)` — each leg gated
// by an `#[authorize_once("from","_nonce")]` authwit:
//   - EUR leg: taker -> maker for `eur_notional` (authorized by the TAKER)
//   - FSFT leg: maker -> taker for `fill_amount`  (authorized by the MAKER)
// In both, the DEX contract is the `caller`, the token is the authwit consumer.
//
// LIMITATION (carried over from dex/cancel): order intents are private notes in
// each owner's PXE and are keyed publicly only by an opaque commitment, so the
// route cannot map a legacy public `orderId` back to a specific intent. It
// matches the FIRST open intent for each of the supplied taker/maker addresses.
// Per-intent selection (by commitment / salt) is a follow-up. The legacy
// `orderId` field is accepted but ignored on the V2 path.

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    address,
    orderId,
    takerAddress,
    makerAddress,
    fillAmount,
    accountIndex = 0,
  } = body as {
    address?: string;
    orderId?: number;
    makerOrderId?: number;
    takerAddress?: string;
    makerAddress?: string;
    fillAmount?: number;
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

    // The taker is the matching account (the caller / `address`); the maker is
    // the counterparty whose resting sell intent is being filled. `makerAddress`
    // is required to locate the maker's private intent; `takerAddress` defaults
    // to the caller.
    const takerAddrStr = takerAddress ?? address;
    if (!makerAddress) {
      return NextResponse.json(
        { error: "makerAddress is required to locate the maker's private sell intent" },
        { status: 400 }
      );
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
    const takerOwner = AztecAddress.fromString(takerAddrStr);
    const makerOwner = AztecAddress.fromString(makerAddress);
    const dexAddress = AztecAddress.fromString(dexAddr);

    const DexArtifactJson = await loadGeneratedArtifactJson("fsft_dex-FSFTDex.json");
    const dexArtifact = loadContractArtifact(DexArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const dexContract = await Contract.at(dexAddress, dexArtifact, actor.wallet);

    // Resolve the settlement token addresses from the DEX itself (authoritative).
    const tokens = simResult<{ fsft_token: unknown; eur_token: unknown }>(
      await dexContract.methods.get_settlement_tokens().simulate({ from: actorAddress })
    );
    const fsftTokenAddr = AztecAddress.fromString(String(tokens.fsft_token));
    const eurTokenAddr = AztecAddress.fromString(String(tokens.eur_token));

    // Fetch the FIRST open private OrderIntentNote hint for each side. Each hint
    // exposes the underlying note fields at `.note.*`.
    interface IntentHint {
      note: {
        owner: unknown;
        side: bigint;
        amount: bigint;
        price_bps: bigint;
        expiry_block: bigint;
        salt: unknown;
      };
    }
    // Each side's OrderIntentNotes are private to that owner's PXE scope, so
    // each read must be simulated FROM that owner (the shared EmbeddedWallet
    // holds all test-account keys). Reading the maker's intents `from` the
    // matcher returns nothing.
    const [takerIntents, makerIntents] = await Promise.all([
      dexContract.methods.get_my_order_intents(takerOwner, 0).simulate({ from: takerOwner }),
      dexContract.methods.get_my_order_intents(makerOwner, 0).simulate({ from: makerOwner }),
    ]);
    const takerResult = simResult<{ len: bigint; storage: IntentHint[] }>(takerIntents);
    const makerResult = simResult<{ len: bigint; storage: IntentHint[] }>(makerIntents);
    if (takerResult.len === 0n) {
      return NextResponse.json({ error: "No open private buy intent found for taker." }, { status: 400 });
    }
    if (makerResult.len === 0n) {
      return NextResponse.json({ error: "No open private sell intent found for maker." }, { status: 400 });
    }
    const hintedTakerIntent = takerResult.storage[0];
    const hintedMakerIntent = makerResult.storage[0];

    const takerAmount = takerResult.storage[0].note.amount;
    const makerAmount = makerResult.storage[0].note.amount;
    const makerPriceBps = makerResult.storage[0].note.price_bps;

    // Fill defaults to the largest crossable size (min of both intents). The
    // contract re-asserts fill <= each side's amount and that prices cross.
    const requestedFill = fillAmount !== undefined ? BigInt(Math.round(Number(fillAmount))) : undefined;
    const maxFill = takerAmount < makerAmount ? takerAmount : makerAmount;
    const fill = requestedFill ?? maxFill;
    if (fill <= 0n) {
      return NextResponse.json({ error: "fillAmount must be positive" }, { status: 400 });
    }
    if (fill > maxFill) {
      return NextResponse.json(
        { error: `fillAmount ${fill} exceeds matchable size ${maxFill}` },
        { status: 400 }
      );
    }

    // Settlement at the maker's price (mirrors the contract). u128 (bigint) math.
    const eurNotional = (fill * makerPriceBps) / 10000n;
    if (eurNotional <= 0n) {
      return NextResponse.json({ error: "Trade has zero notional at the maker's price" }, { status: 400 });
    }

    // Authwit nonces. msg_sender for the inner token call is the DEX contract
    // (not the approver), so a non-zero nonce is required on each leg.
    const takerAuthwitNonce = 1n;
    const makerAuthwitNonce = 2n;

    // Build the two #[authorize_once] authwits the contract's settlement legs
    // will consume. The DEX is the `caller`; the token contract is the consumer.
    const TokenArtifactJson = await loadGeneratedArtifactJson("token_contract-Token.json");
    const tokenArtifact = loadContractArtifact(TokenArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const eurContract = await Contract.at(eurTokenAddr, tokenArtifact, actor.wallet);
    const fsftContract = await Contract.at(fsftTokenAddr, tokenArtifact, actor.wallet);

    // EUR leg: taker -> maker for eur_notional, authorized by the taker.
    const eurCall = await eurContract.methods
      .transfer_private_to_private(takerOwner, makerOwner, eurNotional, takerAuthwitNonce)
      .getFunctionCall();
    const takerAuthwit = await actor.wallet.createAuthWit(takerOwner, {
      caller: dexAddress,
      call: eurCall,
    });

    // FSFT leg: maker -> taker for fill_amount, authorized by the maker.
    const fsftCall = await fsftContract.methods
      .transfer_private_to_private(makerOwner, takerOwner, fill, makerAuthwitNonce)
      .getFunctionCall();
    const makerAuthwit = await actor.wallet.createAuthWit(makerOwner, {
      caller: dexAddress,
      call: fsftCall,
    });

    const receipt = await dexContract.methods
      .match_order_private(
        hintedTakerIntent,
        hintedMakerIntent,
        fill,
        takerAuthwitNonce,
        makerAuthwitNonce
      )
      .send({ from: actorAddress, authWitnesses: [takerAuthwit, makerAuthwit] });

    return NextResponse.json({
      success: true,
      message: "Order matched",
      fillAmount: Number(fill),
      eurNotional: Number(eurNotional),
      txHash: requireAztecTxHash(receipt),
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dex/match]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
