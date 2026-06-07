/**
 * W3a E2E #4 -- Governance: deposit_private -> cast_vote_private
 *
 * Exercises the secret-ballot private flow on the governance path: a vote that
 * consumes TWO hinted notes for the SAME caller and tallies only the aggregate
 * yes/no counters publicly.
 *   - cast_vote_private consumes a HintedNote<KycCredentialNote> (cross-contract,
 *     from KYCVerifier, proving the voter is verified) AND a HintedNote<DepositNote>
 *     (same proof of fund exposure), then claims a per-(proposal, voter)
 *     SingleUseClaim nullifier so a voter can vote at most once per proposal.
 *
 * Self-contained, like the rent/rewards e2es: a fresh ephemeral PXE rediscovers
 * the bootstrap KYC credential (get_my_kyc_credentials -> 1) but NOT a DepositNote
 * minted by another process's PXE, so we MINT the deposit note in-process here.
 * A fresh proposal is created by the admin/proposer in-process (no shared epoch),
 * keeping the voting window open ([created, deadline), 12 blocks) for the vote.
 *
 * Flow (test0 = bootstrap admin + KYC'd investor + proposer + voter):
 *   1. get_proposal_count()                  -> next proposal_id (bootstrap has #0)
 *   2. create_proposal(desc_hash, amount)    -> a fresh ACTIVE proposal (investor-gated)
 *   3. depositInProcess(test0)               -> KYC hint + a *small* DepositNote in-process
 *   4. get_proposal(pid).yes_votes           -> baseline tally (0 for a fresh proposal)
 *   5. cast_vote_private(pid, true, kycHint, depositHint) -> tallies one YES privately
 *   6. assert yes_votes += 1; re-vote same (proposal, voter) -> MUST fail (SingleUseClaim)
 *   7. assert yes_votes did NOT move again after the rejected re-vote
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
  depositInProcess,
  kycHint,
} from "./harness";

const TAG = "e2e:vote";

// The proposal amount is irrelevant to the tally; keep it small and well within
// total deposits. The proposal_id is chosen dynamically from get_proposal_count
// (bootstrap created #0), so re-runs against the shared node never collide.
const PROPOSAL_AMOUNT = BigInt(process.env.VOTE_PROPOSAL_AMOUNT ?? "1000");
const DESC_HASH = BigInt(process.env.VOTE_DESC_HASH ?? "1");

type ProposalView = {
  desc_hash: bigint;
  amount: bigint;
  yes_votes: bigint;
  no_votes: bigint;
  status: bigint;
  created_block: bigint;
  deadline_block: bigint;
};

async function readProposal(gov: { methods: any }, pid: number, from: AztecAddress): Promise<ProposalView> {
  return simValue<ProposalView>(await gov.methods.get_proposal(pid).simulate({ from }));
}

async function main() {
  const h = await connect();
  const test0 = h.addresses[0]; // bootstrap admin + KYC'd investor (proposer + voter)
  log(TAG, `admin/proposer/voter test0 = ${test0.toString()}`);

  const govAddr = requireEnv("NEXT_PUBLIC_GOVERNANCE_ADDRESS");
  const hfAddr = requireEnv("NEXT_PUBLIC_HOUSING_FUND_ADDRESS");
  const kycAddr = requireEnv("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS");
  const gov = await loadContract(h, govAddr, "governance-Governance");
  const hf = await loadContract(h, hfAddr, "housing_fund-HousingFund");
  const kyc = await loadContract(h, kycAddr, "kyc_verifier-KYCVerifier");
  log(TAG, `governance = ${govAddr}`);
  log(TAG, `housing_fund = ${hfAddr}`);

  // -- 1-2. create a fresh ACTIVE proposal in-process (investor-gated) --------
  // create_proposal returns the prior count as the new id; the proposal opens
  // ACTIVE with a deadline created_block + 12, so the vote below lands inside
  // the [created, deadline) window. Picking the id off get_proposal_count keeps
  // re-runs on the shared node from clashing.
  const countBefore = Number(
    simValue<bigint>(await gov.methods.get_proposal_count().simulate({ from: test0 })),
  );
  log(TAG, `create_proposal(desc=${DESC_HASH}, amount=${PROPOSAL_AMOUNT}) -> id ${countBefore}`);
  await sendOk(gov.methods.create_proposal(DESC_HASH, PROPOSAL_AMOUNT), test0, "create_proposal");
  const proposalId = countBefore;

  // -- 3. mint a fresh DepositNote in-process + read the discoverable KYC hint -
  // cast_vote_private consumes BOTH (same caller). A fresh ephemeral PXE cannot
  // rediscover a DepositNote minted by another process, so depositInProcess mints
  // one here (sized AT the small_threshold -- the amount is never revealed to the
  // vote, only its existence/ownership matters).
  const dep = await depositInProcess(h, hf, kyc, test0);
  const depHint = dep.depositHint;
  log(TAG, `deposit ${dep.amount} (small=${dep.isSmall}) cum_before=${dep.cumBefore} seq=${dep.seq} -> ${dep.noteCount} note(s)`);
  const kHint = await kycHint(h, kyc, test0);

  // -- 4. baseline tally (fresh proposal => 0 yes) ---------------------------
  const before = await readProposal(gov, proposalId, test0);
  const yesBefore = BigInt(before.yes_votes);
  log(TAG, `baseline proposal ${proposalId}: status=${before.status} yes_votes=${yesBefore} deadline=${before.deadline_block}`);
  assert.equal(yesBefore, 0n, `fresh proposal ${proposalId} should start with 0 yes_votes`);

  // -- 5. the private flow under test ----------------------------------------
  log(TAG, `cast_vote_private(${proposalId}, yes=true, kycHint, depositHint)`);
  await sendOk(
    gov.methods.cast_vote_private(proposalId, true, kHint, depHint),
    test0,
    "cast_vote_private",
  );

  // -- 6. assert the YES tally moved by exactly one --------------------------
  const after = await readProposal(gov, proposalId, test0);
  const yesAfter = BigInt(after.yes_votes);
  log(TAG, `yes_votes: ${yesBefore} -> ${yesAfter}`);
  assert.equal(
    yesAfter - yesBefore,
    1n,
    `yes_votes should increase by exactly 1 after a successful cast_vote_private`,
  );

  // -- 7. a second vote on the SAME (proposal, voter) must be rejected --------
  // The per-(proposal, voter) SingleUseClaim nullifier (vote_claims.at(pid).at(caller))
  // was consumed by the first vote, so this re-vote must fail -- a voter cannot
  // vote twice on the same proposal.
  log(TAG, `re-voting on the SAME proposal as the SAME voter (must fail)...`);
  const second = await sendExpectFail(
    gov.methods.cast_vote_private(proposalId, true, kHint, depHint),
    test0,
  );
  assert(second.failed, `a second vote on the same (proposal, voter) must fail; instead it ${second.how}`);
  log(TAG, `re-vote correctly failed (${second.how})`);

  const final = await readProposal(gov, proposalId, test0);
  assert.equal(
    BigInt(final.yes_votes),
    yesAfter,
    "yes_votes must NOT change after a rejected re-vote",
  );

  log(TAG, `PASS -- cast_vote_private tallied 1 YES on proposal ${proposalId}; double-vote rejected; tally consistent.`);
}

main().catch((err) => {
  console.error(`[${TAG}] FAILED:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
