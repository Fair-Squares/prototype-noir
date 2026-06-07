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
  depositInProcess,
  openRentEpoch,
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

  // -- 1-3+6. mint a fresh DepositNote in-process (shared helper) -------------
  // depositInProcess reads the discoverable KYC hint, reads the FIFO cursors,
  // deposits AT the small_threshold (is_small => earns a small-pool share; a
  // fresh deposit's FIFO share is 0), and reads the new note's hint back.
  const dep = await depositInProcess(h, hf, kyc, test0);
  const depHint = dep.depositHint;
  log(TAG, `deposit ${dep.amount} (small=${dep.isSmall}) cum_before=${dep.cumBefore} seq=${dep.seq} -> ${dep.noteCount} note(s)`);

  const balBefore = await privateEur(eur, test0);
  log(TAG, `baseline private EUR(test0) = ${balBefore}`);

  // -- 4-5. admin posts rent + opens the rent distribution (shared helper) ----
  // openRentEpoch wires the EUR token (idempotent; bootstrap leaves HF.eur_token
  // == 0, which would revert the payout "eur token mismatch" -- this e2e CAUGHT
  // that gap), posts rent, opens the epoch, and returns the snapshot params the
  // private claim must supply (small_pool/small_total/fifo_cap/snapshot_block).
  const snap = await openRentEpoch(h, hf, test0, { epoch: EPOCH, amount: RENT_AMOUNT, eurAddr });
  const smallPool = snap.smallPool;
  const smallTotal = snap.smallTotal;
  const fifoCap = snap.fifoCap;
  const snapBlock = snap.snapshotBlock;
  log(TAG, `epoch ${EPOCH}: amount=${snap.amount} small_pool=${smallPool} small_total=${smallTotal} fifo_cap=${fifoCap} snapshot_block=${snapBlock}`);

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
