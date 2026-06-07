/**
 * W3a E2E #2 -- HousingFund: deposit_private -> claim_rent_private
 *
 * Exercises two private hinted-note flows on the rent path, end to end:
 *   - deposit_private        consumes a HintedNote<KycCredentialNote> (cross-contract,
 *                            from KYCVerifier) and mints a DepositNote
 *   - claim_rent_private     consumes that DepositNote (same-contract hint) and pays
 *                            rent EUR privately, guarded by a per-(note,epoch) nullifier
 *
 * Self-contained, like the rewards e2e: a fresh ephemeral PXE rediscovers the
 * bootstrap KYC credential (get_my_kyc_credentials -> 1) but NOT a DepositNote
 * minted by another process's PXE, so we MINT the deposit note in-process here.
 * A rent epoch is opened directly by the admin/keeper (no governance lifecycle),
 * and the seed never touches rent -- so the epoch is a clean input.
 *
 * Flow (test0 = bootstrap admin + KYC'd depositor):
 *   1. get_my_kyc_credentials(test0)            -> KYC hint (discoverable)
 *   2. get_deposit_cursor_unconstrained()        -> FIFO cursors
 *   3. deposit_private(amount, kycHint, ...)      -> mints a *small* DepositNote in-process
 *   4. record_rent(0, RENT) + open_rent_distribution(E, RENT)
 *   5. get_rent_distribution_status(E)            -> small_pool/small_total/fifo_cap/snapshot_block
 *   6. get_my_deposit_notes(test0)               -> the in-process DepositNote hint
 *   7. claim_rent_private(E, hint, eur, ...)      -> private EUR payout (small-pool share)
 *   8. assert private EUR += claimed_total; re-claim same (note,epoch) -> MUST fail
 *
 * The deposit is sized <= the small threshold so it earns a SMALL-POOL share
 * (small_share = small_pool * amount / small_total) -- a new deposit's FIFO share
 * is 0 (its cum_before is far past fifo_cap), so the small pool is what makes the
 * claim non-zero. Run: see scripts/e2e/README.md.
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
} from "./harness";

const TAG = "e2e:rent-claim";

const EPOCH = Number(process.env.RENT_EPOCH ?? "0");
// Kept under property 0's covenant ceiling (acq 500000 * 350bps/10000/12 ~= 1458/mo)
// so the test passes even if a covenant is synced for it.
const RENT_AMOUNT = BigInt(process.env.RENT_AMOUNT ?? "1000");

type RentStatus = {
  open: boolean;
  amount: bigint;
  small_total: bigint;
  small_pool: bigint;
  fifo_cap: bigint;
  claimed_total: bigint;
  snapshot_block: bigint;
};

async function privateEur(token: { methods: any }, owner: AztecAddress): Promise<bigint> {
  return BigInt(simValue<bigint>(await token.methods.balance_of_private(owner).simulate({ from: owner })));
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
  const eur = await loadContract(h, eurAddr, "token_contract-Token");
  log(TAG, `housing_fund = ${hfAddr}`);

  // The epoch must be fresh (open_rent_distribution rejects a re-open).
  const pre = simValue<RentStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  assert(!pre.open, `rent epoch ${EPOCH} is already open -- re-run with RENT_EPOCH set to a fresh index`);

  // -- 1. KYC hint (discoverable cross-PXE) ----------------------------------
  const creds = simValue<{ len: bigint; storage: unknown[] }>(
    await kyc.methods.get_my_kyc_credentials(test0, 0).simulate({ from: test0 }),
  );
  log(TAG, `get_my_kyc_credentials -> len=${creds.len}`);
  assert(BigInt(creds.len) >= 1n, "test0 has no KYC credential -- did bootstrap issue_credential run?");
  const kycHint = creds.storage[0];

  // -- 2. FIFO cursors + small threshold -------------------------------------
  const cursor = simValue<{
    cum_deposits: bigint;
    cum_small_deposits: bigint;
    deposit_seq: bigint;
    small_threshold: bigint;
  }>(await hf.methods.get_deposit_cursor_unconstrained().simulate({ from: test0 }));
  // Deposit AT the small threshold => is_small=true => earns a small-pool share
  // (a fresh deposit's FIFO share is 0; the small pool is what makes it non-zero).
  const DEPOSIT = BigInt(cursor.small_threshold);
  const suppliedCumBefore = BigInt(cursor.cum_deposits);
  const suppliedSeq = BigInt(cursor.deposit_seq);
  const suppliedIsSmall = DEPOSIT <= BigInt(cursor.small_threshold);
  log(TAG, `cursor: cum_before=${suppliedCumBefore} seq=${suppliedSeq} threshold=${BigInt(cursor.small_threshold)} -> deposit ${DEPOSIT} (small=${suppliedIsSmall})`);

  // -- 3. mint a fresh DepositNote in-process (consumes the KYC hint) ---------
  log(TAG, `deposit_private(${DEPOSIT}, kycHint, ...)`);
  await sendOk(
    hf.methods.deposit_private(DEPOSIT, kycHint, suppliedCumBefore, suppliedSeq, suppliedIsSmall),
    test0,
    "deposit_private",
  );

  const balBefore = await privateEur(eur, test0);
  log(TAG, `baseline private EUR(test0) = ${balBefore}`);

  // -- 4. admin posts rent + opens the rent distribution ---------------------
  // The bootstrap does NOT wire the EUR token into the fund (HF.eur_token == 0),
  // so the rent payout would revert "eur token mismatch" -- this e2e CAUGHT that
  // gap (it also breaks the live frontend rent claim until bootstrap sets it; a
  // bootstrap fix follows). set_eur_token is admin-only and idempotent.
  log(TAG, `set_eur_token(${eurAddr})`);
  await sendOk(hf.methods.set_eur_token(AztecAddress.fromString(eurAddr)), test0, "set_eur_token");

  log(TAG, `record_rent(0, ${RENT_AMOUNT}) + open_rent_distribution(${EPOCH}, ${RENT_AMOUNT})`);
  await sendOk(hf.methods.record_rent(0, RENT_AMOUNT), test0, "record_rent");
  await sendOk(hf.methods.open_rent_distribution(EPOCH, RENT_AMOUNT), test0, "open_rent_distribution");

  // -- 5. snapshot params the private claim must supply ----------------------
  const st = simValue<RentStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  const smallPool = BigInt(st.small_pool);
  const smallTotal = BigInt(st.small_total);
  const fifoCap = BigInt(st.fifo_cap);
  const snapBlock = Number(st.snapshot_block);
  log(TAG, `epoch ${EPOCH}: amount=${BigInt(st.amount)} small_pool=${smallPool} small_total=${smallTotal} fifo_cap=${fifoCap} snapshot_block=${snapBlock}`);

  // -- 6. the in-process DepositNote hint ------------------------------------
  const deposits = simValue<{ len: bigint; storage: unknown[] }>(
    await hf.methods.get_my_deposit_notes(test0, 0).simulate({ from: test0 }),
  );
  log(TAG, `get_my_deposit_notes -> len=${deposits.len}`);
  assert(BigInt(deposits.len) >= 1n, "expected the in-process DepositNote");
  const depHint = deposits.storage[0];

  // -- 7. the private flow under test ----------------------------------------
  log(TAG, `claim_rent_private(epoch=${EPOCH}, depositHint, eur, snapshots...)`);
  await sendOk(
    hf.methods.claim_rent_private(EPOCH, depHint, AztecAddress.fromString(eurAddr), smallPool, smallTotal, fifoCap, snapBlock),
    test0,
    "claim_rent_private",
  );

  // -- 8. assert EUR payout == claimed_total (test0 is the sole claimer) ------
  const stAfter = simValue<RentStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  const claimedTotal = BigInt(stAfter.claimed_total);
  const balAfter = await privateEur(eur, test0);
  log(TAG, `claimed_total=${claimedTotal}; private EUR ${balBefore} -> ${balAfter}`);
  assert(claimedTotal > 0n, "claimed_total should be > 0 after a successful rent claim");
  assert.equal(balAfter - balBefore, claimedTotal, "private EUR payout should equal the epoch's claimed_total");

  // -- 9. double-claim of the SAME (note, epoch) must be rejected ------------
  log(TAG, `re-claiming the SAME note for epoch ${EPOCH} (must fail)...`);
  const second = await sendExpectFail(
    hf.methods.claim_rent_private(EPOCH, depHint, AztecAddress.fromString(eurAddr), smallPool, smallTotal, fifoCap, snapBlock),
    test0,
  );
  assert(second.failed, `re-claim of an already-claimed (note,epoch) must fail; instead it ${second.how}`);
  log(TAG, `re-claim correctly failed (${second.how})`);

  const stFinal = simValue<RentStatus>(
    await hf.methods.get_rent_distribution_status(EPOCH).simulate({ from: test0 }),
  );
  assert.equal(BigInt(stFinal.claimed_total), claimedTotal, "claimed_total must NOT change after a rejected re-claim");

  log(TAG, `PASS -- deposit_private minted a note; claim_rent_private paid ${claimedTotal} EUR privately; double-claim rejected.`);
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
