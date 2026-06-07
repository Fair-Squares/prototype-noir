/**
 * W3a E2E #3 -- HousingFund: deposit_private -> reinvest_rent_private
 *
 * Exercises the private hinted-note REINVEST path (the compounding sibling of
 * claim_rent_private). Instead of paying the rent share out as EUR, the share is
 * minted as a FRESH DepositNote -- new fund capital -- in the caller's own note
 * set, and the public tail advances both the rent epoch's claimed_total and the
 * fund's total_deposits aggregate. It consumes:
 *   - deposit_private        a HintedNote (cross-contract KYC) producing the
 *                            rent-bearing source DepositNote
 *   - reinvest_rent_private  consumes that DepositNote (same-contract hint),
 *                            re-deposits its rent share, guarded by a
 *                            per-(note,epoch) nullifier (single-use)
 *
 * Self-contained, like the rewards / rent-claim e2es: a fresh ephemeral PXE
 * rediscovers the bootstrap KYC credential but NOT a DepositNote minted by
 * another process's PXE, so we MINT the source deposit note in-process here. A
 * rent epoch is opened directly by the admin/keeper (no governance lifecycle).
 *
 * Flow (test0 = bootstrap admin + KYC'd depositor):
 *   1-3+6. depositInProcess -> mint a *small* DepositNote + read its hint
 *   4-5.   openRentEpoch    -> set_eur_token + record_rent + open_rent_distribution
 *   7.     read the CURRENT FIFO cursors (the new note's cum_before / seq)
 *   8.     reinvest_rent_private(epoch, hint, snapshots..., cursors...)
 *   9.     assert deposit-note count +1, claimed_total += share, total_deposits += share
 *  10.     re-reinvest the SAME (note,epoch) -> MUST fail (single-use nullifier)
 *
 * The deposit is sized AT the small threshold so it earns a SMALL-POOL share
 * (small_share = small_pool * amount / small_total) -- a fresh deposit's FIFO
 * share is 0 (its cum_before is far past fifo_cap), so the small pool is what
 * makes the reinvested share non-zero. Run: see scripts/e2e/README.md.
 */

import assert from "node:assert/strict";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  connect,
  loadContract,
  requireEnv,
  log,
  simValue,
  sendOk,
  sendExpectFail,
  depositInProcess,
  depositCursor,
  openRentEpoch,
  totalClaim,
  type DepositCursor,
  type DistributionStatus,
  type BoundedVec,
} from "./harness";

const TAG = "e2e:reinvest";

// Fresh epoch index so re-runs on a long-lived node don't clash with a prior
// reinvest (or the rent-claim e2e's epoch 0). Bump RENT_EPOCH on re-run.
const EPOCH = Number(process.env.RENT_EPOCH ?? "5");
// Kept under property 0's covenant ceiling (acq 500000 * 350bps/10000/12 ~= 1458/mo)
// so the test passes even if a covenant is synced for it.
const RENT_AMOUNT = BigInt(process.env.RENT_AMOUNT ?? "1000");

async function depositNoteCount(hf: { methods: any }, owner: AztecAddress): Promise<bigint> {
  const notes = simValue<BoundedVec>(
    await hf.methods.get_my_deposit_notes(owner, 0).simulate({ from: owner }),
  );
  return BigInt(notes.len);
}

async function totalDeposits(hf: { methods: any }, from: AztecAddress): Promise<bigint> {
  return BigInt(simValue<bigint>(await hf.methods.get_total_deposits().simulate({ from })));
}

async function main() {
  const h = await connect();
  const test0 = h.addresses[0];
  log(TAG, `admin/depositor test0 = ${test0.toString()}`);

  const hfAddr = requireEnv("NEXT_PUBLIC_HOUSING_FUND_ADDRESS");
  const kycAddr = requireEnv("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS");
  const eurAddr = requireEnv("NEXT_PUBLIC_EUR_TOKEN_ADDRESS");
  const hf = await loadContract(h, hfAddr, "housing_fund-HousingFund");
  const kyc = await loadContract(h, kycAddr, "kyc_verifier-KYCVerifier");
  // eur_token is wired by openRentEpoch (idempotent); load it only to assert it
  // resolves (the reinvest path itself never touches EUR -- the share re-deposits).
  await loadContract(h, eurAddr, "token_contract-Token");
  log(TAG, `housing_fund = ${hfAddr}`);

  // The epoch must be fresh (open_rent_distribution rejects a re-open).
  const pre = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  assert(!pre.open, `rent epoch ${EPOCH} is already open -- re-run with RENT_EPOCH set to a fresh index`);

  // -- 1-3+6. mint a fresh DepositNote in-process (shared helper) -------------
  // depositInProcess reads the discoverable KYC hint, reads the FIFO cursors,
  // deposits AT the small_threshold (is_small => earns a small-pool share; a
  // fresh deposit's FIFO share is 0), and reads the new note's hint back.
  const countBeforeDeposit = await depositNoteCount(hf, test0);
  const dep = await depositInProcess(h, hf, kyc, test0);
  const depHint = dep.depositHint;
  const countAfterDeposit = await depositNoteCount(hf, test0);
  log(TAG, `deposit ${dep.amount} (small=${dep.isSmall}) cum_before=${dep.cumBefore} seq=${dep.seq} -> ${dep.noteCount} note(s)`);
  assert.equal(
    countAfterDeposit - countBeforeDeposit,
    1n,
    "deposit_private should mint exactly one new rent-bearing DepositNote",
  );

  // -- 4-5. admin posts rent + opens the rent distribution (shared helper) ----
  // openRentEpoch wires the EUR token (idempotent), posts rent, opens the epoch,
  // and returns the snapshot params the private reinvest must supply.
  const snap = await openRentEpoch(h, hf, test0, { epoch: EPOCH, amount: RENT_AMOUNT, eurAddr });
  const smallPool = snap.smallPool;
  const smallTotal = snap.smallTotal;
  const fifoCap = snap.fifoCap;
  const snapBlock = snap.snapshotBlock;
  log(TAG, `epoch ${EPOCH}: amount=${snap.amount} small_pool=${smallPool} small_total=${smallTotal} fifo_cap=${fifoCap} snapshot_block=${snapBlock}`);

  const openStatus = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  assert(openStatus.open, `rent epoch ${EPOCH} should be open after openRentEpoch`);
  assert.equal(BigInt(openStatus.amount), RENT_AMOUNT, "rent epoch amount should equal RENT_AMOUNT");
  assert.equal(BigInt(openStatus.claimed_total), 0n, "rent epoch claimed_total should be 0 before reinvest");

  // -- the exact share the reinvest will mint as new capital ------------------
  // For a fresh small deposit, FIFO share = 0 (cum_before past fifo_cap), so the
  // whole share is the small-pool share. This mirrors the contract's total_claim.
  const expectedShare = totalClaim(dep.amount, dep.cumBefore, dep.isSmall, smallPool, smallTotal, fifoCap);
  log(TAG, `expected reinvest share = totalClaim(${dep.amount}, cum_before=${dep.cumBefore}, small=${dep.isSmall}) = ${expectedShare}`);
  assert(expectedShare > 0n, "expected reinvest share must be > 0 (small-pool share of a small deposit)");
  assert(expectedShare <= RENT_AMOUNT, "reinvest share cannot exceed the rent pool");

  // -- 7. read the CURRENT FIFO cursors for the NEW (reinvested) note ----------
  // The public tail (_record_rent_reinvest) asserts supplied_cum_before == the
  // LIVE cum_deposits and supplied_seq == the LIVE deposit_seq (the new note is
  // stamped at the head of the FIFO axis). These are NOT the source note's
  // cum_before/seq -- the source deposit already advanced the cursor -- so read
  // them fresh here. The reinvest is the only deposit-mover between now and the
  // tail (single-actor), so they stay current.
  const cursor: DepositCursor = await depositCursor(h, hf, test0);
  const newCumBefore = BigInt(cursor.cum_deposits);
  const newSeq = BigInt(cursor.deposit_seq);
  const newIsSmall = expectedShare <= BigInt(cursor.small_threshold);
  log(TAG, `new-note cursors: cum_before=${newCumBefore} seq=${newSeq} is_small=${newIsSmall} (threshold=${cursor.small_threshold})`);

  // -- baseline (deposit-note count + total_deposits) just before the reinvest -
  const noteCountBefore = await depositNoteCount(hf, test0);
  const totalBefore = await totalDeposits(hf, test0);
  log(TAG, `baseline: deposit_notes=${noteCountBefore} total_deposits=${totalBefore}`);

  // -- 8. the private flow under test -----------------------------------------
  log(TAG, `reinvest_rent_private(epoch=${EPOCH}, depositHint, snapshots..., cursors...)`);
  await sendOk(
    hf.methods.reinvest_rent_private(
      EPOCH,
      depHint,
      smallPool,
      smallTotal,
      fifoCap,
      newCumBefore,
      newSeq,
      newIsSmall,
      snapBlock,
    ),
    test0,
    "reinvest_rent_private",
  );

  // -- 9. assert state moved by exactly `share` -------------------------------
  // (a) a NEW DepositNote was minted as the reinvested capital (tx output).
  const noteCountAfter = await depositNoteCount(hf, test0);
  log(TAG, `deposit_notes: ${noteCountBefore} -> ${noteCountAfter}`);
  assert.equal(
    noteCountAfter - noteCountBefore,
    1n,
    "reinvest_rent_private should mint exactly one new DepositNote (the reinvested capital)",
  );

  // (b) the rent epoch consumed exactly `share`.
  const stAfter = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  const claimedTotal = BigInt(stAfter.claimed_total);
  log(TAG, `epoch claimed_total: 0 -> ${claimedTotal} (expected ${expectedShare})`);
  assert.equal(claimedTotal, expectedShare, "epoch claimed_total should increase by exactly the reinvested share");

  // (c) the fund's total_deposits grew by exactly `share` (new capital).
  const totalAfter = await totalDeposits(hf, test0);
  log(TAG, `total_deposits: ${totalBefore} -> ${totalAfter} (delta expected ${expectedShare})`);
  assert.equal(totalAfter - totalBefore, expectedShare, "total_deposits should increase by exactly the reinvested share");

  // -- 10. double-reinvest of the SAME (note, epoch) must be rejected ---------
  // Re-read the live cursors so the FIFO cursor asserts can't be the reason it
  // fails -- the single-use nullifier must be what rejects the repeat.
  const cursor2: DepositCursor = await depositCursor(h, hf, test0);
  log(TAG, `re-reinvesting the SAME note for epoch ${EPOCH} (must fail)...`);
  const second = await sendExpectFail(
    hf.methods.reinvest_rent_private(
      EPOCH,
      depHint,
      smallPool,
      smallTotal,
      fifoCap,
      BigInt(cursor2.cum_deposits),
      BigInt(cursor2.deposit_seq),
      expectedShare <= BigInt(cursor2.small_threshold),
      snapBlock,
    ),
    test0,
  );
  assert(second.failed, `re-reinvest of an already-reinvested (note,epoch) must fail; instead it ${second.how}`);
  log(TAG, `re-reinvest correctly failed (${second.how})`);

  // -- 11. the ledgers must NOT move again after a rejected re-reinvest -------
  const stFinal = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  assert.equal(BigInt(stFinal.claimed_total), claimedTotal, "claimed_total must NOT change after a rejected re-reinvest");
  const totalFinal = await totalDeposits(hf, test0);
  assert.equal(totalFinal, totalAfter, "total_deposits must NOT change after a rejected re-reinvest");

  log(TAG, `PASS -- deposit_private minted a note; reinvest_rent_private re-deposited ${expectedShare} as new capital (claimed_total + total_deposits both += ${expectedShare}); double-reinvest rejected.`);
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
