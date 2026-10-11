/**
 * W3a E2E #5 -- HousingFund: claim_distribution_private (full governance lifecycle)
 *
 * Exercises the proposal-distribution private claim end to end, driving the WHOLE
 * governance lifecycle first so the distribution is a real, executed-proposal
 * payout (not an admin-opened rent epoch):
 *   - create_proposal -> two KYC'd depositors cast_vote_private(yes) (quorum = 2)
 *     -> mine past the 12-block voting window -> finalize_proposal ->
 *     execute_proposal -> open_distribution (the runProposalToExecuted helper)
 *   - claim_distribution_private consumes the proposer's in-process DepositNote
 *     (proven against the distribution's snapshot block) and mints FSFT (the FUND
 *     token) private->private to the caller, guarded by a per-(note, proposal,
 *     owner) SingleUseClaim nullifier
 *
 * Self-contained, like the rewards/rent e2es: a fresh ephemeral PXE rediscovers
 * the bootstrap KYC credentials but NOT a DepositNote minted by another process
 * (GOTCHA #4), so the deposits the voters/claimant consume are MINTED IN-PROCESS
 * by runProposalToExecuted (depositInProcess per voter). Each deposit is sized AT
 * the small_threshold so it earns a non-zero SMALL-POOL share (a fresh deposit's
 * FIFO share is 0 -- its cum_before is far past fifo_cap); the small pool is what
 * makes the claim non-zero.
 *
 * Flow (test0 = bootstrap admin + proposer + claimant; test1 = second voter):
 *   1. runProposalToExecuted(proposer=test0, voters=[test0, test1])
 *        -> create_proposal, each voter deposits in-process + cast_vote_private(yes),
 *           advanceBlocks past the window, finalize, execute, open_distribution
 *        -> returns { proposalId, snapshot, deposits[] }
 *   2. read baseline FUND (FSFT) private balance + d_claimed_total(proposalId)
 *   3. predict the claimant's share via totalClaim(deposits[0], snapshot)
 *   4. claim_distribution_private(proposalId, deposits[0].depositHint, fund, snaps)
 *   5. assert FSFT private balance += share, d_claimed_total += share, share <= pool
 *   6. re-claim the SAME (note, proposal) -> MUST fail (SingleUseClaim nullifier),
 *      and d_claimed_total must NOT move again
 *
 * Run: see scripts/e2e/README.md (docker stack up + env.local loaded).
 */

import assert from "node:assert/strict";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import {
  connect,
  loadContract,
  requireEnv,
  log,
  simValue,
  sendOk,
  sendExpectFail,
  runProposalToExecuted,
  totalClaim,
  type DistributionStatus,
} from "./harness";

const TAG = "e2e:distribution";

// The Fair-Squares tranche this proposal funds. Sized well under total deposits
// so the distribution pool is non-empty and the claim fits. Env-overridable so a
// re-run against the long-lived node can pick a fresh amount if desired (the
// proposal id is derived from the live count, so it never collides on its own).
const PROPOSAL_AMOUNT = BigInt(process.env.DISTRIBUTION_AMOUNT ?? "5000");

async function readClaimedTotal(
  hf: { methods: any },
  proposalId: number,
  from: AztecAddress,
): Promise<bigint> {
  const st = simValue<DistributionStatus>(
    await hf.methods.get_distribution_status(proposalId).simulate({ from }),
  );
  return BigInt(st.claimed_total);
}

async function privateFsft(token: { methods: any }, owner: AztecAddress): Promise<bigint> {
  return BigInt(
    simValue<bigint>(await token.methods.balance_of_private(owner).simulate({ from: owner })),
  );
}

async function main() {
  const h = await connect();
  const test0 = h.addresses[0]; // bootstrap admin + proposer + claimant
  const test1 = h.addresses[1]; // second KYC'd voter (quorum needs 2 yes votes)
  log(TAG, `admin/proposer/claimant test0 = ${test0.toString()}`);
  log(TAG, `second voter test1 = ${test1.toString()}`);

  const hfAddr = requireEnv("NEXT_PUBLIC_HOUSING_FUND_ADDRESS");
  const kycAddr = requireEnv("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS");
  const govAddr = requireEnv("NEXT_PUBLIC_GOVERNANCE_ADDRESS");
  const fundAddr = requireEnv("NEXT_PUBLIC_FUND_TOKEN_ADDRESS");
  const hf = await loadContract(h, hfAddr, "housing_fund-HousingFund");
  const kyc = await loadContract(h, kycAddr, "kyc_verifier-KYCVerifier");
  const gov = await loadContract(h, govAddr, "governance-Governance");
  const fund = await loadContract(h, fundAddr, "token_contract-Token");
  log(TAG, `housing_fund = ${hfAddr}`);
  log(TAG, `governance   = ${govAddr}`);
  log(TAG, `fund token   = ${fundAddr}`);

  // -- 1. drive the WHOLE governance lifecycle to an OPEN distribution --------
  // runProposalToExecuted: create_proposal(test0) -> each voter mints a fresh
  // in-process DepositNote (depositInProcess, sized AT small_threshold) + uses
  // its discoverable KYC hint and cast_vote_private(yes) -> advanceBlocks past
  // the 12-block window -> finalize_proposal -> execute_proposal(test0) ->
  // open_distribution(test0). proposer MUST be the admin (execute/open are
  // admin-only); >= 2 voters satisfies quorum = 2. Returns the distribution
  // snapshot params + each voter's in-process deposit (the claim consumes
  // deposits[0], the proposer/claimant test0's note).
  const { proposalId, snapshot, deposits } = await runProposalToExecuted(h, gov, hf, kyc, {
    proposer: test0,
    voters: [test0, test1],
    amount: PROPOSAL_AMOUNT,
  });
  const claimantDep = deposits[0]; // test0's in-process DepositNote
  assert(claimantDep, "runProposalToExecuted returned no deposit for the claimant (test0)");
  const depHint = claimantDep.depositHint;
  log(
    TAG,
    `proposal #${proposalId} EXECUTED + distribution OPEN: amount=${snapshot.amount} ` +
      `small_pool=${snapshot.smallPool} small_total=${snapshot.smallTotal} ` +
      `fifo_cap=${snapshot.fifoCap} snapshot_block=${snapshot.snapshotBlock}`,
  );
  log(
    TAG,
    `claimant deposit: amount=${claimantDep.amount} small=${claimantDep.isSmall} ` +
      `cum_before=${claimantDep.cumBefore} seq=${claimantDep.seq}`,
  );

  // -- 2-3. baseline + predicted share (TS mirror of the circuit math) -------
  // For a fresh small deposit the FIFO share is 0, so the whole share is the
  // small-pool slice (small_pool * amount / small_total) -- totalClaim computes
  // exactly what the on-chain total_claim() yields.
  const balBefore = await privateFsft(fund, test0);
  const claimedBefore = await readClaimedTotal(hf, proposalId, test0);
  const expectedShare = totalClaim(
    claimantDep.amount,
    claimantDep.cumBefore,
    claimantDep.isSmall,
    snapshot.smallPool,
    snapshot.smallTotal,
    snapshot.fifoCap,
  );
  log(
    TAG,
    `baseline: FSFT(test0)=${balBefore} claimed_total=${claimedBefore}; expected share=${expectedShare}`,
  );
  assert(expectedShare > 0n, "predicted claim share is 0 -- deposit not in the small pool?");

  // -- 4. the private flow under test ----------------------------------------
  log(TAG, `claim_distribution_private(proposal=${proposalId}, depositHint, fund, snapshots...)`);
  await sendOk(
    hf.methods.claim_distribution_private(
      proposalId,
      depHint,
      AztecAddress.fromStringUnsafe(fundAddr),
      snapshot.smallPool,
      snapshot.smallTotal,
      snapshot.fifoCap,
      snapshot.snapshotBlock,
    ),
    test0,
    "claim_distribution_private",
  );

  // -- 5. assert FSFT was minted == claimed_total delta == predicted share ---
  const balAfter = await privateFsft(fund, test0);
  const claimedAfter = await readClaimedTotal(hf, proposalId, test0);
  const balDelta = balAfter - balBefore;
  const claimedDelta = claimedAfter - claimedBefore;
  log(TAG, `FSFT(test0): ${balBefore} -> ${balAfter} (delta ${balDelta})`);
  log(TAG, `claimed_total: ${claimedBefore} -> ${claimedAfter} (delta ${claimedDelta})`);
  assert(balDelta > 0n, "private FSFT balance should increase after claim_distribution_private");
  assert.equal(balDelta, expectedShare, "FSFT minted should equal the predicted small-pool share");
  assert.equal(claimedDelta, expectedShare, "claimed_total should increase by exactly the share");
  assert.equal(balDelta, claimedDelta, "FSFT minted and claimed_total delta must agree");
  assert(claimedAfter <= snapshot.amount, "claimed_total must never exceed the distribution pool");

  // -- 6. double-claim of the SAME (note, proposal) must be rejected ----------
  log(TAG, `re-claiming the SAME note for proposal ${proposalId} (must fail)...`);
  const second = await sendExpectFail(
    hf.methods.claim_distribution_private(
      proposalId,
      depHint,
      AztecAddress.fromStringUnsafe(fundAddr),
      snapshot.smallPool,
      snapshot.smallTotal,
      snapshot.fifoCap,
      snapshot.snapshotBlock,
    ),
    test0,
  );
  assert(
    second.failed,
    `re-claim of an already-claimed (note, proposal) must fail; instead it ${second.how}`,
  );
  log(TAG, `re-claim correctly failed (${second.how})`);

  const claimedFinal = await readClaimedTotal(hf, proposalId, test0);
  assert.equal(
    claimedFinal,
    claimedAfter,
    "claimed_total must NOT change after a rejected re-claim",
  );

  log(
    TAG,
    `PASS -- full governance lifecycle -> distribution open; claim_distribution_private ` +
      `minted ${expectedShare} FSFT; double-claim rejected; ledgers consistent.`,
  );
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
