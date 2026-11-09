# Privacy-First V2 Redesign Plan

Date: April 16, 2026

## Summary
Build a clean V2 privacy-native protocol on Aztec, keeping only aggregate protocol metrics public and moving all user-linked state to private notes and private execution paths.

Chosen defaults:
- Full private intents DEX
- Secret-ballot governance
- Selective KYC reveal path
- V2 redeploy
- No existing-user migration

## Implementation Changes
1. Introduce shared privacy primitives used across contracts.
- Add reusable note types: `KycCredentialNote`, `DepositTicketNote`, `RewardClaimNote`, `VoteNote`, `OrderIntentNote`.
- Use `Owned<...>` and note-based state for all user-specific balances and flags.
- Use nullifier-based single-use claims for anti-double-spend and anti-double-vote.
- Keep only aggregate protocol accounting in `PublicMutable` storage (`fund` totals, supply, epoch totals, global claimed/distributed totals, public proposal status).

2. Replace public KYC flags with private credentials (`KYCVerifierV2`).
- Remove public per-address `verified` and `investor_role` maps.
- Add verifier-only issuance/revocation of non-transferable private KYC investor credentials.
- Add private assertion method for downstream contracts: caller has valid investor credential.
- Keep optional public aggregate counter (`verified_count`) only.
- Add selective reveal flow: user can generate auditor/regulator attestations from wallet-side proof package (no global on-chain public flag).

3. Privatize user deposits (`HousingFundV2`).
- Replace public `deposit_tickets` map with private deposit ticket notes.
- Convert `deposit` and `withdraw` to private entrypoints that consume/create deposit notes.
- Continue updating `total_deposits`, `total_in_defi`, and `total_allocated` publicly via only-self/public finalization.
- Remove public user ticket getters; provide wallet/PXE private reads for user position.

4. Privatize user rewards (`ProtocolRewardsV2`).
- Remove public per-user maps (`user_claimable`, `user_total_claimed`, `user_last_claimed_epoch`).
- Keep public epoch/global reward parameters and totals.
- Move user allocations to private reward notes; claiming consumes notes privately.
- Keep global public claimed/distributed accounting for transparency.

5. Secret-ballot governance (`GovernanceV2`).
- Remove public `has_voted` and `user_deposit_ticket` linkage.
- Use private eligibility checks (KYC credential + private exposure proof) at vote time.
- Use single-use vote claims/nullifiers for one-vote-per-user-per-proposal.
- Store individual votes privately; publish only final tallies/status at finalize.
- Finalization uses proof-backed tally submission (no per-vote public trace).

6. Full private intents DEX (`FSFTDexV2`).
- Remove public per-order owner/amount/price storage.
- Replace with commitment-based private intents and nullifier lifecycle (`open`, `matched`, `cancelled` without revealing price/size/owner).
- Use off-chain relayer/matcher for encrypted intent discovery and pairing.
- Perform settlement privately with proof checks and private token movements.
- Keep only optional aggregate public market telemetry (for example total matched volume).

7. Frontend/API/backend refactor for private reads.
- Remove API responses that expose per-user on-chain public maps.
- Shift user portfolio/reward/eligibility views to wallet/PXE-scoped private reads.
- Add relayer client integration for DEX private intents.
- Add selective reveal endpoint flow (user consent + proof package generation/verification metadata).
- Preserve simple public endpoints for fund-wide metrics only.

8. Redeploy and cutover (no existing users).
- Deploy V2 contracts with new addresses.
- Wire V2 addresses in env/config and frontend clients.
- Freeze or deprecate V1 write paths.
- Start V2 with clean user-private state; no V1 user migration required.

## Public API / Interface Changes
Contracts:
1. `KYCVerifierV2`: remove `is_verified(user)` / `is_investor(user)` public per-user checks; add private credential assertion/issuance/revocation flow plus aggregate-only public stats.
2. `HousingFundV2`: replace public user ticket read/write API with private deposit-note operations; keep public aggregate stats API.
3. `ProtocolRewardsV2`: remove public per-user claimable/user stats; keep public epoch/global reward stats; add private claim-note flows.
4. `GovernanceV2`: `cast_vote` becomes private secret-ballot flow; add finalize-with-proof tally endpoint.
5. `FSFTDexV2`: replace public orderbook methods with private intent lifecycle methods and commitment/nullifier status checks.

Backend/Frontend:
1. Portfolio/rewards/eligibility UI moves to wallet-owned private queries.
2. DEX UI moves to relayer-backed private intent UX (no on-chain public orderbook rendering).
3. Public pages keep only aggregate protocol stats.

## Test Plan
1. Privacy invariants (contracts + integration).
- Public state inspection cannot recover user KYC status, deposit amount, claimable rewards, vote record, or order details.
- Explorer-visible data contains only approved aggregates and commitment/nullifier metadata.

2. Correctness invariants.
- Private deposit/withdraw updates user private balance and public fund totals correctly.
- Private rewards claim updates private user state and public global counters correctly.
- Governance enforces one vote per eligible user, with final tally correctness proof verification.
- DEX private intents can be placed/matched/cancelled with correct private settlement and anti-replay nullifiers.

3. API/UI behavior.
- User-facing endpoints/pages still render full portfolio/rewards/governance state for the connected wallet only.
- Public views show fund totals/supply/epoch aggregates without user leakage.

4. Regression and failure-mode tests.
- Invalid/expired KYC credentials fail eligibility.
- Double-vote, double-claim, and replayed intent nullifiers fail.
- Unauthorized reveal requests fail; consented reveal artifacts verify.

## Assumptions
- No existing production users to migrate; V2 starts clean.
- Private means no user-linked values stored/readable from public on-chain state.
- Selective reveal is user-consented and audit-targeted, not globally public.
- Real-time public orderbook is intentionally removed to satisfy full private-intent DEX requirement.
- Hashing remains Poseidon2; no fallback defaults or silent error masking in new flows.
