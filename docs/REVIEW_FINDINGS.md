# Security & Quality Review — Findings (tracked)

*Produced: 2026-06-02. Method: 14-dimension multi-agent review (each reviewer
grounded in the Noir/Aztec MCP corpora), every candidate finding adversarially
verified against the actual code + the pinned v4.3 API surface. 92 candidates →
**79 verified** (13 rejected as version-wrong or unsubstantiated); deduped to the
~60 canonical entries below.*

**Scope:** 6 Aztec.nr contracts (HousingFund, FSFTDex, ProtocolRewards,
Governance, KYCVerifier, DeFiVault) + 4 note-type libraries, 3 recursive-proof
circuits, and the full frontend aztec.js / PXE / Next.js API layer.

**Versions:** aztec-nr **v4.3.0** / Noir **1.0.0-beta.21**; frontend `@aztec/*`
**4.3.0**. The MCP doc corpus is **v4.2** — version caveats are flagged inline
where they bite (notably L11).

**Status legend:** `[ ]` open · `[x]` fixed (link the commit) · `[~]` won't-fix /
accepted-as-prototype (note why). Line numbers are as of this review and may
drift — confirm before editing.

---

## Counts

| Severity | Count | Notes |
|---|---:|---|
| Critical | 0 | worst vectors need the admin key or the single-note privacy posture |
| High | 6 | economic-integrity + gate-bypass on value-bearing paths — **release blockers** |
| Medium | 17 | unenforced controls, swallowed errors, privacy leakage |
| Low / Info | 37 | latent traps in dead code, hygiene, doc/comment honesty |

By dimension (verified/total): housing_fund 6/7 · fsft_dex 7/8 · protocol_rewards
7/9 · governance 5/7 · kyc_verifier 5/5 · defi_vault+notes 4/4 · recursive_proofs
5/8 · fe_aztecjs_pxe 6/7 · fe_contracts_ts 4/5 · fe_api_routes 10/10 ·
noir_optimization 5/5 · version_deprecation 3/4 · privacy_contracts 8/8 ·
privacy_data_leak 4/5.

---

## Executive summary

The contract layer is on a **clean, current v4.3.0 surface** (modern
`#[aztec]`/`#[external]` macros, canonical note-history flow, Poseidon2
throughout, correct partial-note DEX settlement), the core allocation math (FIFO
+ 30% small-pool floor) is integer-exact and order-independent, and crate
identity is consistent (all crates pin aztec-packages v4.3.0). The actively-used
frontend paths use correct v4.3 APIs. **But there are real economic-integrity and
privacy defects on the value-bearing paths** — in the canonical
deposit/claim/rewards/vote flows, not in dead scaffolding.

The cryptographic privacy primitives are used correctly (notes carry
randomness/nonce; nullifiers are nhk/secret-derived and unlinkable; DEX
`place_order` publishes nothing identity-bearing). The privacy leaks are
**architectural, at the boundaries**: a deterministic KYC commitment reused
across deposit+vote, per-user rewards/KYC state in address-keyed *public* maps,
public `is_investor(caller)` checks on public flows, and a single shared server
PXE whose request-supplied "auth" lets any caller read another account's private
notes.

### Dominant themes

1. **`assert_note_existed_by` ≠ valid/unspent/unrevoked.** Proves Merkle
   inclusion at the anchor block only — not non-nullification, not non-revocation.
   Underlies H1 and H4. Any new claim/gate path inherits this trap. Fix shape:
   add the missing assertion (`w_withdraw_nullifiers` absent / `is_credential_revoked`
   in the public tail / snapshot-bound eligibility). MCP:
   `aztec-nr/aztec/src/history/note.nr` — `assert_note_was_valid_by` = existed **+ not-nullified**.
2. **Configured-but-unenforced controls** — a parameter is stored,
   constructor-validated, and surfaced to the UI, but never asserted on the
   constrained write path (DEX band/TTL, rewards 8M cap on the private path,
   `checkpoint_epoch` idempotency, vote deadline).
3. **Snapshot/eligibility not bound on pooled pro-rata claims** — claims don't
   assert the deposit existed when the pool opened, so late deposits dilute/race
   honest snapshot-time depositors.
4. **Private→public boundary + off-chain layer leak identity** (the privacy
   cluster: M12–M17, L8, L14).
5. **Error-handling/honesty violations** cluster in live API routes and dead
   read-shims that fabricate sentinels.
6. **Duplication of correctness-sensitive logic** (emission schedule,
   available-balance, rent claim prologue).
7. **Tests stop at constructor smoke tests** — FSFTDex/Governance/KYCVerifier
   lack the lifecycle/double-vote/revocation tests CLAUDE.md's Task-22 plan requires.

---

## High — release blockers (before any real-money or non-local exposure)

- [ ] **H1 — Withdrawn deposit notes can still claim distributions and rent.**
  `contracts/housing_fund/src/main.nr:969-1000, 1013-1065, 1099-1159` ·
  *correctness*. `withdraw_private` consumes a nullifier in `w_withdraw_nullifiers`,
  but `claim_distribution_private`/`claim_rent_private`/`reinvest_rent_private`
  use `assert_note_existed_by` (inclusion only) and never check that map;
  `cum_deposits` is monotonic so the share stays positive. The comment at
  998-999 claiming the note "can no longer prove existence" is **false**.
  *Fix:* assert the `w_withdraw_nullifiers` entry for `(note_hash, owner)` is
  absent in each claim/reinvest path (or unify withdraw+claim under one
  note-consuming nullifier); correct the comment.

- [ ] **H2 — Public-path twin: fully-withdrawn public depositor keeps earning.**
  `contracts/housing_fund/src/main.nr:442-464, 598-628, 675-714` · *correctness*.
  `withdraw()` decrements totals but deliberately doesn't retract the
  `DepositRecord` or roll back `cum_deposits` ("known prototype limitation",
  459-463). Claims key off immutable FIFO intervals → withdrawn public depositor
  still mints FSFT and claims EUR. Open to any KYC'd investor (not admin-gated).
  *Fix:* invalidate the affected `DepositRecord`(s) FIFO-style on withdraw, or
  deprecate the legacy public deposit/withdraw path.

- [ ] **H3 — Claims don't bind to the distribution snapshot.**
  `contracts/housing_fund/src/main.nr:598-628, 675-714, 1013-1065, 1099-1159` ·
  *correctness*. `open_distribution`/`open_rent_distribution` snapshot totals,
  but no claim path checks the deposit existed at snapshot time. The diluting
  mechanism is the **small pool**: snapshot-time small depositors already tile
  the whole `small_pool`, so a late small depositor over-claims against a single
  global ceiling → a legitimate last claimer hits "exhausted." *Fix:* assert
  `rec.cum_before + rec.amount <= d_snapshot_total.at(pid)` (public) /
  `note.cum_before < snapshot_total` (private, threaded into the public tail).

- [ ] **H4 — DEX `place_order` proves KYC note existence but never checks revocation.**
  `contracts/fsft_dex/src/main.nr:218-271` · *security*. Revocation lives in a
  separate public `KYCVerifier.revocations` map; note existence doesn't reflect
  it. HousingFund checks it; FSFTDex doesn't → a revoked/sanctioned investor can
  still trade. *Fix:* mirror `HousingFund._record_deposit_private` — recompute
  `credential_commitment = poseidon2_hash([owner.to_field(), nonce])` in the
  private leg and `assert(!is_credential_revoked(commitment))` in the public
  `_place_and_match` tail (pattern already compiles in `can_trade` at L562).

- [ ] **H5 — Private reward path bypasses the 8M pool cap and `total_distributed`.**
  `contracts/protocol_rewards/src/main.nr:287-368` · *correctness*.
  `allocate_reward_private`/`claim_reward_private` mint arbitrary amounts
  without touching pool accounting; only public `checkpoint_epoch` enforces the
  cap (L193) and the vendored Token has no supply cap → breaks the fixed-supply
  invariant. Admin-gated. *Fix:* read pool/`total_distributed` in the public
  tail and `assert(distributed + amount <= pool)`, then bump `total_distributed`;
  at minimum `assert(total_claimed <= total_distributed)`.

- [ ] **H6 — Votes accepted after the deadline.**
  `contracts/governance/src/main.nr:135-208` · *correctness*. Neither
  `cast_vote_private` nor `_tally_vote_private` compares the block to
  `p_deadline_block`; the only gate is `STATUS_ACTIVE`, and a proposal stays
  ACTIVE until someone manually finalizes → a voter can wait for the observable
  split, then cast a decisive vote. *Fix:* `assert(block_number() <
  p_deadline_block.at(pid).read(), "voting window closed")` in the public tally tail.

---

## Medium

### Contracts

- [ ] **M2 — `verified_count` double-incremented per user.**
  `contracts/kyc_verifier/src/main.nr:93-110, 119-133, 165-170` · *correctness*.
  `register_kyc` and `issue_credential`→`_record_credential_issue` both increment;
  the canonical onboarding calls both → public `investorCount` ~2×. *Fix:* make
  `verified_count` single-writer (drop the increment from `_record_credential_issue`).
- [ ] **M3 — `revoke_credential` never decrements `verified_count`.**
  `contracts/kyc_verifier/src/main.nr:137-141, 165-170, 78-89` · *correctness*.
  `revoke_kyc` decrements off the legacy `verified` map that V2 issuance never
  populates → counter only grows. Compounds M2. *Fix:* decrement in
  `revoke_credential` on a false→true transition, or remove the
  `_record_credential_issue` increment per M2.
- [ ] **M4 — Stored-but-unread addresses; reward weights are an unverified admin oracle.**
  `contracts/protocol_rewards/src/main.nr:71-72, 125-126, 209-227` · *architecture*.
  `housing_fund`/`governance` written in the constructor but never read;
  deposit/fsft/vote weights are admin-supplied verbatim. *Fix:* derive weights
  on-chain via cross-contract views, or drop the unused storage/params and
  document `set_user_epoch_weights` as a trusted-oracle write.
- [ ] **M5 — `checkpoint_epoch` is not idempotent.**
  `contracts/protocol_rewards/src/main.nr:153-204` · *correctness*. Re-checkpoint
  re-adds emission to `total_distributed` (L202) and overwrites denominators.
  *Fix:* `assert(!self.storage.epoch_open.at(eid).read(), "epoch already checkpointed")`.
- [ ] **M6 — DEX `price_band_bps` surfaced but never enforced.**
  `contracts/fsft_dex/src/main.nr:184-191, 199-216, 273-303, 538-556` ·
  *correctness*. Orders can be placed at any positive price. *Fix:* in
  `_place_and_match` read `get_valuation_public()`, compute min/max from
  `price_band_bps`, and `assert(price_bps in band)` before writing.
- [ ] **M7 — DEX `max_ttl_blocks` advertised but `ttl_blocks` never bounded.**
  `contracts/fsft_dex/src/main.nr:199-216, 273-293, 538-556` · *correctness*.
  Allows effectively never-expiring resting orders. (NB: the u32-overflow
  rationale is wrong — Noir `+` reverts, doesn't wrap.) *Fix:*
  `assert(ttl_blocks > 0 & ttl_blocks <= max_ttl_blocks.read())` in `_place_and_match`.

### Frontend / API

- [ ] **M1 — PXE contract-registration failures `console.warn`-swallowed.**
  `frontend/src/lib/serverWallet.ts:108-191` · *error-handling*. `initWallet()`
  resolves with contracts unregistered; surfaces later as "Unknown contract."
  *Fix:* let registration errors propagate; distinguish "not configured" (skip)
  from "registration threw" (fail init).
- [ ] **M8 — `findOwnedOrderNote` scans `BoundedVec` padding past `len`.**
  `frontend/src/lib/dexNotes.ts:9-17` · *correctness*. Padding slots have
  `seq === 0`, a real sequence number → orderId 0 by a non-owner returns a
  zeroed note threaded into cancel/claim. *Fix:* `mine.storage.slice(0,
  Number(mine.len))` before `.find(...)` (sibling `my-orders/route.ts:80` already does).
- [ ] **M9 — `kyc/register` reports `verified:true` on swallowed `issue_credential` failure.**
  `frontend/src/app/api/kyc/register/route.ts:84-106` · *error-handling*. User
  told KYC succeeded, then blocked everywhere (every V2 flow hard-errors on the
  missing credential note). CLAUDE.md violation. *Fix:* let the error propagate
  (→ 500) or return `success:false` when `credentialTxHash` is missing.
- [ ] **M10 — `fund/tokens` GET masks balance-read failures as 0.**
  `frontend/src/app/api/fund/tokens/route.ts:80-124` · *error-handling*.
  `try{...}catch{return 0}` renders a real balance as €0 / 0-FSFT. *Fix:* remove
  the inner catch; keep only the `if (!address || !eurTokenAddr) return 0` early return.
- [ ] **M11 — `accounts` route fabricates a `0x0` admin account on failure.**
  `frontend/src/app/api/accounts/route.ts:39-50, 75-79` · *error-handling*.
  Client auto-selects the bogus admin; every live action then fails against the
  zero address. *Fix:* return 503/500 with the real error; delete the
  zero-address branch.

### Privacy

- [ ] **M12 — Deterministic KYC commitment links a user's deposits and votes.**
  `contracts/housing_fund/src/main.nr:904-916`; `contracts/governance/src/main.nr:160-175`
  · *privacy*. `poseidon2_hash([owner, nonce])` is a constant handle published in
  the public tail of both deposit AND vote → an observer clusters a user's
  actions. *Fix:* check revocation fully privately (migrate `revocations` to
  `DelayedPublicMutable`), or bind a per-action salt
  `poseidon2([owner, nonce, action_salt])`. At minimum document the linkage.
  *(FSFTDex `place_order` is the correct model — publishes nothing identity-bearing.)*
- [ ] **M13 — Per-user reward state in address-keyed PUBLIC maps.**
  `contracts/protocol_rewards/src/main.nr:90-97, 209-278, 371-411` · *privacy*.
  `user_claimable`/`user_total_claimed`/`user_last_claimed_epoch` + per-address
  views leak the full reward-participation set and each participant's history.
  *Fix:* move per-user accounting to the private `RewardClaimNote` path; keep
  only aggregates public; gate public views behind explicit opt-in transparency.
- [ ] **M14 — Rewards eligibility reads target's PUBLIC FSFT balance.**
  `contracts/protocol_rewards/src/main.nr:241-243, 469-475` · *privacy*. Only
  public FSFT holders earn (pushes deanonymization) and the public write records
  that the address holds FSFT. *Fix:* let holders attest eligibility privately
  via a `HintedNote` ownership proof (as `cast_vote_private` does).
- [ ] **M15 — Legacy public KYC maps + public `is_investor(caller)` leak the participant set.**
  `contracts/kyc_verifier/src/main.nr:42-44, 93-110, 174-190` · *privacy*.
  `HousingFund.deposit:390`, `Governance.create_proposal:105`,
  `FSFTDex.can_trade:561`, `ProtocolRewards.claim:375` call `is_investor(caller)`
  on a public path → every public deposit/propose/claim publicly confirms KYC
  status. *Fix:* scope the public maps/`is_investor` as transparency-mode-only
  and route everyday flows through the private credential path.
- [ ] **M16 — Single server PXE holds all account keys; "address matches accountIndex" is not auth.**
  `frontend/src/lib/serverWallet.ts:87-104` · *privacy/architecture*. One PXE can
  decrypt every test account's private notes; both `accountIndex` and `address`
  come from the request, so any HTTP caller can read/transact as another account
  (worst: `/api/kyc/status`). No session/JWT anywhere in `src/app/api/`. *Fix
  (documented in CLAUDE.md as of this review):* live-mode is a single-tenant local
  demo with no per-user authn. For multi-user/testnet exposure, add per-session
  challenge-signature auth and derive the acting account from the session
  (ideally one PXE/keys per browser).
- [ ] **M17 — `/api/dex/orders` POST returns the order's owner-tag secret.**
  `frontend/src/app/api/dex/orders/route.ts:239-262` · *privacy*. `ownerTagSecret`
  is the pre-image of the anonymous `owner_tag = poseidon2([secret, seq])`; with
  public `seq`, anyone can compute the tag and read claimable balances via the
  unauthenticated `get_claimable`. No client consumes it. *Fix:* remove
  `ownerTagSecret` from the response.

---

## Low / Info

### Contracts

- [ ] **L1 — Under-subscribed/dusted rent epochs strand EUR (no reclaim).**
  `housing_fund:636-670, 256-272`. *Fix:* admin-only `close_rent_epoch(rid)`
  returning `pool - r_claimed_total`, or size `small_pool` to 0 when `small_total==0`.
- [ ] **L2 — `deposit_private` and reinvest skip the `is_paused` guard.**
  `housing_fund:872-957, 726-803, 1197-1253`. *Fix:* assert `!is_paused` in
  `_record_deposit_private` (public tail) and `reinvest_rent`/`_record_rent_reinvest`.
- [ ] **L3 — DEX `place_order` gates on KYC note existence, not the `is_investor` role `can_trade` advertises.**
  `fsft_dex:218-229, 558-563`. Design-consistency gap, not escalation. *Fix:* pick one source of truth.
- [ ] **L4 — `claim()`/`claim_reward_private` mint without asserting `protocol_token` is set.**
  `protocol_rewards:382-383, 352, 361-365`. *Fix:* `assert(!pt.is_zero())` atop
  `claim()`; move the token check before the private mint.
- [ ] **L5 — `pool * weight` can overflow u64 (reverts allocation).**
  `protocol_rewards:245-265`. *Fix:* compute in u128 (pattern already at L242/L383).
- [ ] **L6 — `claim_reward_private` doesn't constrain the proven note's `storage_slot`.**
  `protocol_rewards:331-346`. Safe today (single note set). *Fix:* assert
  `confirmed.storage_slot == reward_notes.get_storage_slot()` or add the justification comment.
- [ ] **L7 — Governance `finalize_proposal`/`execute_proposal` have no caller auth.**
  `governance:212-248` · *security*. Anyone can flip PASSED→EXECUTED (the gate
  HousingFund `open_distribution` requires). *Fix:* store an admin and assert
  `msg_sender` on `execute_proposal`.
- [ ] **L8 — `create_proposal` leaks proposer address + investor status publicly.**
  `governance:100-124, 68` · *privacy*. *Fix:* mirror `cast_vote_private`, or
  document proposer identity as intentionally public. (`p_proposer` is also dead
  state — see L26 family.)
- [ ] **L9 — Recursive `housing_valuation` never constrains the price/FSFT relationship.**
  `proofs/recursive/housing_valuation/src/main.nr:1-7` · *security*. README claim
  is false; **no live consumer** (`record_asset_sale_recursive` doesn't exist).
  *Fix:* recompute `token_price_bps` in-circuit (u64, not Field-modular), or correct the README.
- [ ] **L10 — `rewards_weights` uses a no-op `assert(epoch == epoch)`.**
  `proofs/recursive/rewards_weights/src/main.nr:14`. Demo-only. *Fix:* delete or add a real constraint.
- [ ] **L11 — No Poseidon2 commitment binds any recursive circuit's private witnesses.**
  `proofs/recursive/*` · *security*, demo-only. **Version caveat:**
  `std::hash::poseidon2::Poseidon2::hash` is `pub(crate)` and **won't compile**
  from a bin crate under beta.21 — use the external `poseidon` dep
  (`use dep::poseidon::poseidon2::Poseidon2;`).
- [ ] **L12 — README/CHANGELOG overstate what the demo circuits prove.**
  `proofs/recursive/fsft_holder/src/main.nr` comments + `README.md:287-290`.
  *Fix:* reword to "checks non-zero/shape only".
- [ ] **L13 — `DeFiVault.withdraw` lacks the `amount > 0` guard deposit/accrue enforce.**
  `defi_vault:88-110`. *Fix:* `assert(amount > 0, "amount must be positive")`.
- [ ] **L14 — Recursive demo circuits expose owner/user/weights as public inputs.**
  `proofs/recursive/*` · *privacy*, demo-only. *Fix:* make identity/amounts
  private witnesses, expose only a commitment, before any live wiring.

### Frontend / API

- [ ] **L15 — Dead `getLive*` readers fabricate sentinels and tag them `source:"live"`.**
  `frontend/src/lib/aztecLive.ts:180-274` · *error-handling*. `0x0`/`false`/`0`/
  placeholder proposals; `deriveMappingSlot` always `null`. Dead (no importers).
  *Fix:* delete the dead readers + `LiveProposal`/`LivePortfolio` interfaces, or throw.
  (`getLiveFundStats` is unused but does NOT fabricate.)
- [ ] **L16 — Dead `aztecClient` node shim returns empty-array sentinels + an unrequested retry/cooldown gate.**
  `frontend/src/lib/aztecClient.ts:66-119` · *error-handling/deprecation*. *Fix:*
  delete the shims + cooldown state; keep only `callNodeRpc`/`getBlockNumber`.
- [ ] **L17 — `getLiveProposals` fabricates a 7-day deadline ignoring on-chain `deadline_block`.**
  `frontend/src/lib/aztecLive.ts:201-203, 228` · *correctness*. Dead code.
  *Fix:* delete with the rest of the dead layer, or read `deadline_block`.
- [ ] **L18 — `votingWindowFor` falls back to `currentBlock 0` when absent.**
  `frontend/src/lib/proposalLifecycle.ts:33-47`. In the default sim path the
  countdown renders ~1.75B "blocks remaining," always "open." Display-only. *Fix:*
  render an explicit unknown state.
- [ ] **L19 — POST client wrappers `return res.json()` without checking `res.ok`.**
  `frontend/src/lib/contracts.ts:69-93, 225-323, 377-401, 582-628, 643-712` ·
  *error-handling*. Opaque `SyntaxError` on a non-JSON failure. *Fix:* route POSTs
  through the existing `readApiError` via a shared `postJson<T>` helper.
- [ ] **L20 — `fetchProposals`/`fetchAccounts` return unvalidated fields typed non-optional.**
  `frontend/src/lib/contracts.ts:221-223, 716-721` · *error-handling*. *Fix:*
  `Array.isArray` check + throw; don't default to `[]`. (`fetchAccounts` is also dead.)
- [ ] **L21 — Read routes replace the real error with a generic 500 message.**
  `frontend/src/app/api/fund/stats/route.ts:170-173` (+ portfolio, kyc/status,
  governance/proposals) · *error-handling*. *Fix:* return
  `error instanceof Error ? error.message : String(error)`.
- [ ] **L22 — DEX BUY shields EUR in a separate tx before `place_order` — partial state on revert.**
  `frontend/src/app/api/dex/orders/route.ts:223-256` · *correctness*. The shield
  is a self-transfer (funds recoverable) but no notice exists. *Fix:* surface that
  a shield occurred on failure (folding it into placement needs a contract change).
- [ ] **L23 — `/api/aztec` proxy sets `Access-Control-Allow-Origin: *`.**
  `frontend/src/app/api/aztec/route.ts:36-42, 61-69` · *security*. Bounded (public
  RPC, port 8080). *Fix:* scope ACAO to the app origin; optionally allowlist RPC methods.
- [ ] **L24 — `dex/orders` treats `amount`/`limitPriceEur` of 0 as "missing" via truthiness.**
  `frontend/src/app/api/dex/orders/route.ts:114-116, 165` · *correctness*.
  Backstopped on-chain. *Fix:* validate `amount>0`; distinguish undefined-price from a provided `<=0`.
- [ ] **L25 — Faucet log ties an address to a chosen EUR amount.**
  `frontend/src/app/api/fund/tokens/route.ts:225` · *security (hygiene)*. *Fix:*
  drop the amount/address from the success log.

### Info / Notes

- [ ] **L26 — Stale NAV documentation in storage comments.**
  `housing_fund:196-198, 210-212, 1380-1392` — comments say rent "backs/is part
  of NAV," contradicting `NAV = total_deposits`. Runtime is correct. *Fix:* reword.
- [ ] **L27 — Every note type carries a redundant explicit `owner` field** the
  `#[note]` macro already appends. `deposit_note/src/lib.nr:36-42`,
  `credential_note.nr:21-24`, `reward_claim_note.nr:17-21`, `order_owner_note.nr:22-26`.
  Wastes 1 packed Field/note; not a hiding defect. *Fix (low):* drop the field
  and the redundant `confirmed.note.owner == caller` checks (keep `confirmed.owner == caller`).
- [ ] **L28 — Self-cross guard (`m_tag != owner_tag`) can't stop self-matching.**
  `fsft_dex:253, 258, 326`. Per-order random secret → tags differ. *Fix:* document
  that self-cross is unpreventable in the anonymous model; remove the misleading guard.
- [ ] **L29 — `OrderOwnerNote` is never nullified on cancel/fill.**
  `fsft_dex:378-405, 434-448`. Sound today (balance-zeroing + status checks).
  *Fix (info):* add a comment so a future partial-claim path preserves the invariant.
- [ ] **L30 — `compute_revocation_commitment` is an unconstrained utility.**
  `kyc_verifier:146-152`. Consumers correctly recompute in-circuit. *Fix (info):*
  doc-comment that the authoritative commitment is the in-circuit recomputation.
- [ ] **L31 — `fsft_holder` `signal` is a hardcoded `pub` constant (`== 1`).**
  `proofs/recursive/fsft_holder/src/main.nr:5`. Burns a public-input slot. *Fix:* drop or bind to real state.
- [ ] **L32 — DepositNote spends a full Field on `is_small`.**
  `deposit_note/src/lib.nr:36-42`. Packing micro-opt; leave unless
  `MAX_NOTE_PACKED_LEN` pressure appears (remove the redundant `owner` first).
- [ ] **L33 — Tie (yes == no) resolves to FAILED with no stated rule.**
  `governance:230-234`. *Fix:* comment the strict-majority rule + add a tie-boundary test.
- [ ] **L34 — DeFiVault is deployed/wired but never invoked.**
  `defi_vault:72-125`. `HousingFund` stores `defi_vault` but never calls it.
  *Fix:* add a source-of-truth comment or gate the vault out of the default deploy.
- [ ] **L35 — `isVercelSimulationMode()` is the exact negation of `isLiveModeEnabled()`.**
  `frontend/src/lib/aztecLive.ts:18-34`. The `!isLiveModeEnabled() &&
  isVercelSimulationMode()` guard (~20 routes) is `!X && !X` → the following 503
  branch is unreachable. *Fix:* collapse to a single `if (!isLiveModeEnabled())`,
  or gate on a real deployment env var.
- [ ] **L36 — `pxeUrl` exposes a testnet target the `.send()` flow can't pay fees on.**
  `frontend/src/lib/pxeUrl.ts:10-21`. *Fix:* reject `AZTEC_NETWORK=testnet` in
  `resolveServerPxeUrl`, or build `new SponsoredFeePaymentMethod(fpcAddress)` and
  pass `fee:{paymentMethod}`. (`SponsoredFeePaymentMethod.new(pxe)` does **not**
  exist in v4.3.0 — use the constructor.)
- [ ] **L37 — `rewards/stats` does server-to-server HTTP to its own routes.**
  `frontend/src/app/api/rewards/stats/route.ts:122, 155-166`. Re-incurs ~18
  `simulate()` calls to extract ~5 fields. *Fix:* extract a shared lib function
  and call it directly.

---

## Recommended roadmap

- **Phase 0 — release blockers (before any real-money / non-local use):** H1+H2+H3
  together (shared FIFO/claim machinery), H4, H5, H6, and **document M16's
  single-tenant no-auth model** (done in CLAUDE.md as of this review).
- **Phase 1 — enforcement + error-handling hygiene:** M5–M11, M2/M3, plus the
  contract asserts L4/L5/L13 and the sim/live error-masking routes (L19–L21, L24).
- **Phase 2 — privacy hardening (the value prop):** M12 (per-action salt or
  `DelayedPublicMutable` revocation), M13/M14 (rewards → private note path +
  private eligibility attestation), M15 (legacy public KYC maps → transparency-only),
  L8. *Verify the `DelayedPublicMutable`/private-migration storage patterns against
  v4.3 first — the MCP corpus is v4.2.*
- **Phase 3 — tests, dedup, cleanup:** the missing Task-22 TestEnvironment coverage
  (FSFTDex lifecycle, Governance happy/double-vote/revocation/tie, KYCVerifier
  issue→prove→revoke→reject + commitment-parity); single-source the duplicated
  emission/available-balance/rent-prologue logic; delete the dead `getLive*`/node
  shim layer (L15–L17, L20, L35); fix or honestly demote the recursive-circuit
  README claims (L9–L14, L31); opportunistic cleanup (L1, L18, L22–L25, L26–L34, L36, L37).
