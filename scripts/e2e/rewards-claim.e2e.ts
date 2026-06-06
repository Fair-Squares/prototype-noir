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

// Epoch is configurable so a re-run against a long-lived stack can use a fresh
// epoch (checkpoint_epoch has no double-checkpoint guard, so re-opening epoch 0
// would re-bump total_distributed -- harmless but noisy). Default 0 for a fresh
// bootstrap.
const EPOCH = Number(process.env.REWARD_EPOCH ?? "0");
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
  const claimedBefore = await readClaimed(rewards, test0);
  const balBefore = await readPrivateBalance(token, test0);
  log(TAG, `baseline: total_claimed=${claimedBefore} privateBalance=${balBefore ?? "n/a"}`);

  // -- 1. open the epoch (admin) --------------------------------------------
  log(TAG, `checkpoint_epoch(${EPOCH}, emission=${EMISSION})`);
  await sendOk(
    rewards.methods.checkpoint_epoch(EPOCH, EMISSION, 100, 100, 100),
    test0,
    "checkpoint_epoch",
  );

  // -- 2. allocate a private reward note to test0 (admin) -------------------
  log(TAG, `allocate_reward_private(${EPOCH}, test0, ${AMOUNT})`);
  await sendOk(
    rewards.methods.allocate_reward_private(EPOCH, test0, AMOUNT),
    test0,
    "allocate_reward_private",
  );

  // -- 3. read the caller's own reward-note hint (NO manual packAsHintedNote) -
  const notes = simValue<{ len: bigint; storage: unknown[] }>(
    await rewards.methods.get_my_reward_notes(test0, 0).simulate({ from: test0 }),
  );
  log(TAG, `get_my_reward_notes -> len=${notes.len}`);
  assert(BigInt(notes.len) >= 1n, "expected >= 1 RewardClaimNote after allocate_reward_private");
  const hint = notes.storage[0];
  assert(hint, "reward-note hint (storage[0]) is empty");

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
