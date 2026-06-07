/**
 * W3a E2E #1 -- ProtocolRewards: allocate_reward_private -> claim_reward_private
 *
 * The EASIEST private hinted-note flow (see PHASE2 plan): the RewardClaimNote is
 * minted AND consumed by the SAME contract, the producer (allocate) needs no
 * hint, and a same-contract utility (get_my_reward_notes) hands the consumer its
 * exact hint -- no KYC note, no deposit note, no authwit, no second contract.
 *
 * Flow (all as test0, the bootstrap admin):
 *   1. checkpoint_epoch(E)            -> opens epoch E (bootstrap does NOT do this)
 *   2. allocate_reward_private(E, .)  -> mints a RewardClaimNote to test0
 *   3. get_my_reward_notes(test0)     -> read the caller's own HintedNote (storage[0])
 *   4. claim_reward_private(hint, T)  -> proves note inclusion, mints protocol token
 *   5. assert total_claimed += AMOUNT (and private token balance += AMOUNT if readable)
 *   6. re-claim the SAME hint         -> MUST fail (SingleUseClaim nullifier)
 *
 * Run: see scripts/e2e/README.md (docker stack up + env.local loaded).
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

const TAG = "e2e:rewards";

// Start epoch is configurable; the flow scans UPWARD from here for the first
// epoch that is NOT yet open (get_epoch_stats(e).open === false) and uses that
// as the run's epoch. This matters on the shared long-lived node: RewardClaimNotes
// are NEVER nullified (claim_reward_private burns a per-(note_hash,owner)
// SingleUseClaim nullifier, leaving the note itself ACTIVE forever), so notes
// accumulate across runs and re-using an already-claimed epoch's note would emit a
// duplicate siloed nullifier. checkpoint_epoch also has no double-checkpoint guard
// (re-opening would just re-bump total_distributed), so picking a fresh epoch each
// run keeps the flow self-contained and re-runnable (gotcha #5).
const EPOCH_START = Number(process.env.REWARD_EPOCH ?? "0");
// Emission must be <= epoch_emission_target(8M pool, EPOCH) (~10400 at epoch 0)
// and is what protocol_rewards/src/test.nr setup_full uses.
const EMISSION = BigInt(process.env.REWARD_EMISSION ?? "1000");
// Allocation amount: > claim_min(1), well within the emission/pool. Protocol
// token has 0 decimals here, so this is raw units.
const AMOUNT = BigInt(process.env.REWARD_AMOUNT ?? "100");

async function readClaimed(rewards: { methods: any }, from: AztecAddress): Promise<bigint> {
  const cfg = simValue<{ total_claimed: bigint; total_distributed: bigint }>(
    await rewards.methods.get_rewards_config().simulate({ from }),
  );
  return BigInt(cfg.total_claimed);
}

async function readPrivateBalance(
  token: { methods: any },
  owner: AztecAddress,
): Promise<bigint | null> {
  // The protocol token is the vendored AIP-20 Token; balance_of_private exists
  // (used across the frontend). If the artifact somehow lacks it, fall back to
  // asserting on total_claimed only rather than masking the difference.
  try {
    return BigInt(
      simValue<bigint>(await token.methods.balance_of_private(owner).simulate({ from: owner })),
    );
  } catch (e) {
    log(TAG, `(private balance read unavailable: ${e instanceof Error ? e.message : e}) -- asserting on total_claimed only`);
    return null;
  }
}

async function main() {
  const h = await connect();
  const test0 = h.addresses[0]; // bootstrap admin
  log(TAG, `admin test0 = ${test0.toString()}`);

  const rewardsAddr = requireEnv("NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS");
  const tokenAddr = requireEnv("NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS");
  const rewards = await loadContract(h, rewardsAddr, "protocol_rewards-ProtocolRewards");
  const token = await loadContract(h, tokenAddr, "protocol_rewards-Token");
  log(TAG, `rewards = ${rewardsAddr}`);
  log(TAG, `token   = ${tokenAddr}`);

  // -- baseline --------------------------------------------------------------
  const cfgBefore = simValue<{ total_epochs: bigint }>(
    await rewards.methods.get_rewards_config().simulate({ from: test0 }),
  );
  const totalEpochs = Number(cfgBefore.total_epochs);
  const claimedBefore = await readClaimed(rewards, test0);
  const balBefore = await readPrivateBalance(token, test0);
  log(TAG, `baseline: total_claimed=${claimedBefore} privateBalance=${balBefore ?? "n/a"} total_epochs=${totalEpochs}`);

  // -- 0. pick a fresh (not-yet-open) epoch ---------------------------------
  // Scan upward from EPOCH_START for the first epoch with open === false. Re-using
  // an already-claimed epoch's note re-emits its nullifier (duplicate). A fresh
  // epoch guarantees the note we allocate below is brand-new and unclaimed.
  let epoch = -1;
  for (let e = EPOCH_START; e < totalEpochs; e++) {
    const stats = simValue<{ open: boolean }>(
      await rewards.methods.get_epoch_stats(e).simulate({ from: test0 }),
    );
    if (!stats.open) {
      epoch = e;
      break;
    }
  }
  assert(epoch >= 0, `no un-opened epoch found from ${EPOCH_START}..<${totalEpochs}`);
  log(TAG, `selected fresh epoch ${epoch} (scanned from ${EPOCH_START})`);

  // Emission for this epoch must be <= its emission target (later epochs taper).
  const target = BigInt(
    simValue<bigint>(await rewards.methods.get_epoch_target(epoch).simulate({ from: test0 })),
  );
  const emission = EMISSION <= target ? EMISSION : target;
  assert(AMOUNT <= emission, `AMOUNT ${AMOUNT} must fit within epoch emission ${emission}`);
  log(TAG, `epoch ${epoch} target=${target} -> using emission=${emission}`);

  // -- 1. open the epoch (admin) --------------------------------------------
  log(TAG, `checkpoint_epoch(${epoch}, emission=${emission})`);
  await sendOk(
    rewards.methods.checkpoint_epoch(epoch, emission, 100, 100, 100),
    test0,
    "checkpoint_epoch",
  );

  // -- 2. allocate a private reward note to test0 (admin) -------------------
  log(TAG, `allocate_reward_private(${epoch}, test0, ${AMOUNT})`);
  await sendOk(
    rewards.methods.allocate_reward_private(epoch, test0, AMOUNT),
    test0,
    "allocate_reward_private",
  );

  // -- 3. read the caller's own reward-note hint (NO manual packAsHintedNote) -
  // RewardClaimNotes accumulate (never nullified), so get_my_reward_notes can
  // return notes from prior runs. Select the note created THIS run by matching its
  // epoch (fresh => exactly one match, and it is unclaimed). The HintedNote decodes
  // with a `.note` field exposing the RewardClaimNote struct (owner/amount/epoch).
  const notes = simValue<{ len: bigint; storage: { note: { epoch: bigint; amount: bigint } }[] }>(
    await rewards.methods.get_my_reward_notes(test0, 0).simulate({ from: test0 }),
  );
  log(TAG, `get_my_reward_notes -> len=${notes.len}`);
  assert(BigInt(notes.len) >= 1n, "expected >= 1 RewardClaimNote after allocate_reward_private");
  const matchIdx = notes.storage.findIndex((hn) => Number(hn.note.epoch) === epoch);
  assert(
    matchIdx >= 0,
    `no RewardClaimNote for fresh epoch ${epoch} (have epochs: ${notes.storage.map((hn) => Number(hn.note.epoch)).join(",")})`,
  );
  const matched = notes.storage[matchIdx];
  assert.equal(
    BigInt(matched.note.amount),
    AMOUNT,
    `the epoch-${epoch} reward note amount should equal the allocated ${AMOUNT}`,
  );
  const hint = matched as unknown;
  assert(hint, `reward-note hint (storage[${matchIdx}]) is empty`);
  log(TAG, `selected reward note at storage[${matchIdx}] (epoch=${epoch} amount=${matched.note.amount})`);

  // -- 4. the private flow under test ---------------------------------------
  log(TAG, `claim_reward_private(hint, token)`);
  await sendOk(
    rewards.methods.claim_reward_private(hint, AztecAddress.fromString(tokenAddr)),
    test0,
    "claim_reward_private",
  );

  // -- 5. assert state moved ------------------------------------------------
  const claimedAfter = await readClaimed(rewards, test0);
  log(TAG, `total_claimed: ${claimedBefore} -> ${claimedAfter}`);
  assert.equal(
    claimedAfter - claimedBefore,
    AMOUNT,
    `total_claimed should increase by exactly ${AMOUNT}`,
  );
  if (balBefore !== null) {
    const balAfter = await readPrivateBalance(token, test0);
    log(TAG, `private token balance: ${balBefore} -> ${balAfter}`);
    assert.equal(
      (balAfter ?? 0n) - balBefore,
      AMOUNT,
      `private protocol-token balance should increase by exactly ${AMOUNT}`,
    );
  }

  // -- 6. double-claim of the SAME note must be rejected (SingleUseClaim) ----
  log(TAG, `re-claiming the SAME note (must fail)...`);
  const second = await sendExpectFail(
    rewards.methods.claim_reward_private(hint, AztecAddress.fromString(tokenAddr)),
    test0,
  );
  assert(second.failed, `re-claim of an already-claimed reward note must fail; instead it ${second.how}`);
  log(TAG, `re-claim correctly failed (${second.how})`);

  const claimedFinal = await readClaimed(rewards, test0);
  assert.equal(
    claimedFinal,
    claimedAfter,
    "total_claimed must NOT change after a rejected re-claim",
  );

  log(TAG, `PASS -- allocate -> claim minted ${AMOUNT}; double-claim rejected; ledgers consistent.`);
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
