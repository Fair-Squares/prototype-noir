/**
 * W3a E2E #6 -- FSFTDex: place_order -> cancel_order
 *
 * The richest private hinted-note flow: a SELL placement consumes a CROSS-CONTRACT
 * HintedNote<KycCredentialNote> (from KYCVerifier), escrows private FSFT into the
 * DEX's public balance under a pre-issued authwit, and SELF-MINTS an
 * OrderOwnerNote (the only person-to-order link). cancel_order then consumes that
 * in-process OrderOwnerNote (same-contract hint) and refunds the unfilled escrow
 * to the order's anonymous claimable balance.
 *
 * Self-contained, like the other e2es. A fresh ephemeral PXE rediscovers the
 * bootstrap KYC credential but NOT FSFT (only minted via the housing fund) nor an
 * OrderOwnerNote minted by another process's PXE -- so this flow MINTS the FSFT
 * it escrows IN-PROCESS via the governance distribution lifecycle
 * (runProposalToExecuted -> claim_distribution_private), then places + cancels its
 * own resting order so the OrderOwnerNote it proves was created in THIS run.
 *
 * Flow (test0 = bootstrap admin + KYC'd investor; test1 = second KYC'd voter for
 * the 2-yes quorum):
 *   1. runProposalToExecuted(proposer=test0, voters=[test0,test1]) -> open FSFT distribution
 *   2. claim_distribution_private(test0's deposit note) -> mints PRIVATE FSFT to test0
 *   3. get_my_kyc_credentials(test0)         -> KYC hint (discoverable, cross-contract)
 *   4. get_order_count()                     -> supplied_seq (== seq_counter)
 *   5. createAuthWit transfer_private_to_public(test0, dex, amount, nonce)
 *   6. place_order(SELL, amount, ..., kycHint) w/ that authwit -> escrows FSFT, mints OrderOwnerNote
 *   7. get_order(seq) -> OPEN, remaining=amount, escrow=FSFT; get_claimable(owner_tag) -> 0
 *   8. get_my_orders(test0) -> the in-process OrderOwnerNote hint for seq
 *   9. cancel_order(hint) -> CANCELLED, remaining=0, claimable_fsft += amount
 *  10. re-cancel the SAME note -> MUST fail ("order not cancellable"); claimable unchanged
 *
 * Run: see scripts/e2e/README.md (docker stack up + env.local loaded).
 */

import assert from "node:assert/strict";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { poseidon2Hash } from "@aztec/foundation/crypto/poseidon";
import {
  connect,
  loadContract,
  requireEnv,
  log,
  simValue,
  sendOk,
  sendExpectFail,
  runProposalToExecuted,
  type BoundedVec,
} from "./harness";

const TAG = "e2e:dex";

// Order-book sides / statuses / escrow tokens mirror fsft_dex/src/main.nr globals.
const SIDE_SELL = 1;
const STATUS_OPEN = 0;
const STATUS_CANCELLED = 3;
const TOKEN_FSFT = 1;

// Proposal amount sized so test0's small-pool distribution share comfortably
// covers the SELL escrow. Env-overridable so re-runs against the long-lived
// stack can use a distinct proposal (create_proposal returns count-1, so a fresh
// id is automatic, but the amount knob lets a re-run tune headroom).
const DIST_AMOUNT = BigInt(process.env.DEX_DIST_AMOUNT ?? "1000");
// SELL price (par = 1.0 EUR/FSFT) and ttl. No price-band check at placement, so
// par always rests cleanly. ttl well under the DEX max_ttl_blocks (120).
const PRICE_BPS = BigInt(process.env.DEX_PRICE_BPS ?? "10000");
const TTL_BLOCKS = Number(process.env.DEX_TTL_BLOCKS ?? "60");
// Requested SELL size; capped to the actually-claimed FSFT balance at runtime.
const SELL_AMOUNT_REQ = BigInt(process.env.DEX_SELL_AMOUNT ?? "50");

type OrderView = {
  seq: bigint;
  side: bigint;
  price_bps: bigint;
  amount: bigint;
  remaining: bigint;
  status: bigint;
  expiry_block: bigint;
  escrow_token: bigint;
};

type ClaimableView = { fsft: bigint; eur: bigint };

// A loosely-typed method-bound Contract (we only ever touch `.methods.*`).
type AnyContract = { methods: any };

async function privateBalance(token: AnyContract, owner: AztecAddress): Promise<bigint> {
  return BigInt(
    simValue<bigint>(await token.methods.balance_of_private(owner).simulate({ from: owner })),
  );
}

async function readOrder(dex: AnyContract, seq: bigint, from: AztecAddress): Promise<OrderView> {
  return simValue<OrderView>(await dex.methods.get_order(seq).simulate({ from }));
}

async function readClaimable(dex: AnyContract, ownerTag: Fr, from: AztecAddress): Promise<ClaimableView> {
  return simValue<ClaimableView>(await dex.methods.get_claimable(ownerTag).simulate({ from }));
}

async function main() {
  const h = await connect();
  const test0 = h.addresses[0]; // bootstrap admin + KYC'd investor
  const test1 = h.addresses[1]; // second KYC'd voter (for the 2-yes quorum)
  log(TAG, `admin/seller test0 = ${test0.toString()}`);
  log(TAG, `co-voter   test1 = ${test1.toString()}`);

  const dexAddr = requireEnv("NEXT_PUBLIC_FSFT_DEX_ADDRESS");
  const govAddr = requireEnv("NEXT_PUBLIC_GOVERNANCE_ADDRESS");
  const hfAddr = requireEnv("NEXT_PUBLIC_HOUSING_FUND_ADDRESS");
  const kycAddr = requireEnv("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS");
  const fsftAddr = requireEnv("NEXT_PUBLIC_FUND_TOKEN_ADDRESS");
  const dex = await loadContract(h, dexAddr, "fsft_dex-FSFTDex");
  const gov = await loadContract(h, govAddr, "governance-Governance");
  const hf = await loadContract(h, hfAddr, "housing_fund-HousingFund");
  const kyc = await loadContract(h, kycAddr, "kyc_verifier-KYCVerifier");
  const fsft = await loadContract(h, fsftAddr, "token_contract-Token");
  log(TAG, `dex = ${dexAddr}`);

  // -- 1. drive a governance proposal to an OPEN FSFT distribution -----------
  // Each voter mints a fresh in-process DepositNote (its KYC hint proves
  // exposure) and votes YES; the shared helper finalizes/executes/opens the
  // distribution and returns the per-voter deposits + the snapshot params.
  log(TAG, `runProposalToExecuted(proposer=test0, voters=[test0,test1], amount=${DIST_AMOUNT})`);
  const prop = await runProposalToExecuted(h, gov, hf, kyc, {
    proposer: test0,
    voters: [test0, test1],
    amount: DIST_AMOUNT,
  });
  const test0Deposit = prop.deposits[0]; // test0 is voters[0]
  const snap = prop.snapshot;
  log(
    TAG,
    `proposal #${prop.proposalId}: small_pool=${snap.smallPool} small_total=${snap.smallTotal} fifo_cap=${snap.fifoCap} snapshot_block=${snap.snapshotBlock}`,
  );

  // -- 2. mint PRIVATE FSFT to test0 via claim_distribution_private ----------
  const fsftBefore = await privateBalance(fsft, test0);
  log(TAG, `claim_distribution_private(proposal #${prop.proposalId}, test0 deposit note)`);
  await sendOk(
    hf.methods.claim_distribution_private(
      prop.proposalId,
      test0Deposit.depositHint,
      AztecAddress.fromString(fsftAddr),
      snap.smallPool,
      snap.smallTotal,
      snap.fifoCap,
      snap.snapshotBlock,
    ),
    test0,
    "claim_distribution_private",
  );
  const fsftAfterClaim = await privateBalance(fsft, test0);
  const minted = fsftAfterClaim - fsftBefore;
  log(TAG, `private FSFT(test0): ${fsftBefore} -> ${fsftAfterClaim} (minted ${minted})`);
  assert(minted > 0n, "claim_distribution_private should mint a non-zero FSFT share to test0");

  // SELL no more than we actually hold (the small-pool share is integer-floored,
  // so cap the requested size to the minted balance).
  const sellAmount = SELL_AMOUNT_REQ <= minted ? SELL_AMOUNT_REQ : minted;
  assert(sellAmount > 0n, "no FSFT available to escrow for the SELL order");
  log(TAG, `SELL amount = ${sellAmount} FSFT @ ${PRICE_BPS} bps`);

  // -- 3-5. inputs for place_order ------------------------------------------
  // Discoverable KYC hint (proven privately inside place_order).
  const creds = simValue<BoundedVec>(
    await kyc.methods.get_my_kyc_credentials(test0, 0).simulate({ from: test0 }),
  );
  assert(BigInt(creds.len) >= 1n, "test0 has no KYC credential -- did bootstrap issue_credential run?");
  const hintedKycNote = creds.storage[0];
  assert(hintedKycNote, "KYC hint (storage[0]) is empty");

  // supplied_seq must EXACTLY equal seq_counter (== order_count) at placement.
  const suppliedSeq = BigInt(
    simValue<bigint>(await dex.methods.get_order_count().simulate({ from: test0 })),
  );
  log(TAG, `supplied_seq = ${suppliedSeq}`);

  // The escrow authwit the placement's transfer_private_to_public leg consumes:
  // a SELL locks `sellAmount` FSFT from test0 into the DEX's public balance.
  const escrowNonce = Fr.random();
  const escrowCall = await fsft.methods
    .transfer_private_to_public(test0, AztecAddress.fromString(dexAddr), sellAmount, escrowNonce)
    .getFunctionCall();
  const escrowAuthwit = await h.wallet.createAuthWit(test0, {
    caller: AztecAddress.fromString(dexAddr),
    call: escrowCall,
  });

  const secretOwnerKey = Fr.random();
  // owner_tag = poseidon2([secret_owner_key, seq]) -- the anonymous handle the
  // DEX keys claimable balances under (the contract computes it identically).
  const ownerTag = await poseidon2Hash([secretOwnerKey, new Fr(suppliedSeq)]);
  log(TAG, `owner_tag = ${ownerTag.toString()}`);

  // -- 1'. order must not already exist at this seq --------------------------
  const orderBefore = await readOrder(dex, suppliedSeq, test0);
  assert.equal(
    BigInt(orderBefore.amount),
    0n,
    `seq ${suppliedSeq} already has an order -- seq_counter raced (re-run on a quiet node)`,
  );

  // -- 6. place_order (SELL) -- self-mints the OrderOwnerNote ----------------
  // sendOk only does `.send({ from })`; wrap the interaction so its send injects
  // the escrow authwit (the harness Interaction shape is a subset of the real
  // send opts, so this stays inside the shared revert-aware helper).
  const placeInteraction = dex.methods.place_order(
    SIDE_SELL,
    sellAmount,
    PRICE_BPS,
    TTL_BLOCKS,
    secretOwnerKey,
    suppliedSeq,
    escrowNonce,
    0, // match_count: rest the order (no on-chain matching)
    [0n, 0n, 0n, 0n], // maker_seqs: padded, unused at match_count=0
    0, // policy: exact-price
    hintedKycNote,
  );
  const placeWithAuthwit = {
    send: (opts: { from: AztecAddress }) =>
      placeInteraction.send({ from: opts.from, authWitnesses: [escrowAuthwit] }),
  };
  log(TAG, `place_order(SELL, ${sellAmount}, seq=${suppliedSeq}) ...`);
  await sendOk(placeWithAuthwit, test0, "place_order");

  // -- 7. assert the resting order + that nothing is claimable yet -----------
  const orderAfterPlace = await readOrder(dex, suppliedSeq, test0);
  log(
    TAG,
    `order seq=${orderAfterPlace.seq} side=${orderAfterPlace.side} amount=${orderAfterPlace.amount} remaining=${orderAfterPlace.remaining} status=${orderAfterPlace.status} escrow=${orderAfterPlace.escrow_token}`,
  );
  assert.equal(BigInt(orderAfterPlace.side), BigInt(SIDE_SELL), "order side should be SELL");
  assert.equal(BigInt(orderAfterPlace.amount), sellAmount, "order amount should equal the SELL size");
  assert.equal(BigInt(orderAfterPlace.remaining), sellAmount, "no match => remaining == amount");
  assert.equal(BigInt(orderAfterPlace.status), BigInt(STATUS_OPEN), "fresh resting order should be OPEN");
  assert.equal(BigInt(orderAfterPlace.escrow_token), BigInt(TOKEN_FSFT), "SELL escrows FSFT");

  // FSFT moved from test0's private balance into the DEX's escrow.
  const fsftAfterPlace = await privateBalance(fsft, test0);
  log(TAG, `private FSFT(test0) after escrow: ${fsftAfterClaim} -> ${fsftAfterPlace}`);
  assert.equal(
    fsftAfterClaim - fsftAfterPlace,
    sellAmount,
    "place_order should escrow exactly the SELL amount of FSFT out of test0's private balance",
  );

  const claimablePlace = await readClaimable(dex, ownerTag, test0);
  log(TAG, `claimable@place: fsft=${claimablePlace.fsft} eur=${claimablePlace.eur}`);
  assert.equal(BigInt(claimablePlace.fsft), 0n, "an unfilled resting order has no claimable FSFT yet");
  assert.equal(BigInt(claimablePlace.eur), 0n, "an unfilled resting order has no claimable EUR yet");

  // -- 8. read the in-process OrderOwnerNote hint for this seq ---------------
  const myOrders = simValue<BoundedVec>(
    await dex.methods.get_my_orders(test0, 0).simulate({ from: test0 }),
  );
  log(TAG, `get_my_orders -> len=${myOrders.len}`);
  const ownerHint = (myOrders.storage as { note: { seq: bigint } }[]).find(
    (hn) => BigInt(hn.note.seq) === suppliedSeq,
  );
  assert(ownerHint, `no OrderOwnerNote for seq ${suppliedSeq} in test0's PXE -- place_order did not mint one`);

  // -- 9. cancel_order -- refunds the unfilled escrow to the owner_tag -------
  log(TAG, `cancel_order(seq=${suppliedSeq}) ...`);
  await sendOk(dex.methods.cancel_order(ownerHint), test0, "cancel_order");

  const orderAfterCancel = await readOrder(dex, suppliedSeq, test0);
  log(TAG, `order after cancel: status=${orderAfterCancel.status} remaining=${orderAfterCancel.remaining}`);
  assert.equal(BigInt(orderAfterCancel.status), BigInt(STATUS_CANCELLED), "order should be CANCELLED");
  assert.equal(BigInt(orderAfterCancel.remaining), 0n, "cancel should zero remaining (escrow refunded)");

  // The real numeric delta: the full unfilled FSFT escrow is now claimable.
  const claimableCancel = await readClaimable(dex, ownerTag, test0);
  log(TAG, `claimable@cancel: fsft=${claimableCancel.fsft} eur=${claimableCancel.eur}`);
  assert.equal(
    BigInt(claimableCancel.fsft),
    sellAmount,
    "cancel should refund the full unfilled escrow to the owner's claimable FSFT",
  );
  assert.equal(BigInt(claimableCancel.eur), 0n, "a SELL refund accrues no EUR");

  // -- 10. re-cancel the SAME note must be rejected (already CANCELLED) ------
  log(TAG, `re-cancelling the SAME order (must fail)...`);
  const second = await sendExpectFail(dex.methods.cancel_order(ownerHint), test0);
  assert(second.failed, `re-cancel of an already-cancelled order must fail; instead it ${second.how}`);
  log(TAG, `re-cancel correctly failed (${second.how})`);

  const orderFinal = await readOrder(dex, suppliedSeq, test0);
  assert.equal(BigInt(orderFinal.status), BigInt(STATUS_CANCELLED), "status must stay CANCELLED after a rejected re-cancel");
  const claimableFinal = await readClaimable(dex, ownerTag, test0);
  assert.equal(
    BigInt(claimableFinal.fsft),
    sellAmount,
    "claimable FSFT must NOT change after a rejected re-cancel (no double refund)",
  );

  log(
    TAG,
    `PASS -- place_order escrowed ${sellAmount} FSFT + minted an OrderOwnerNote; cancel_order refunded it to claimable; re-cancel rejected.`,
  );
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
