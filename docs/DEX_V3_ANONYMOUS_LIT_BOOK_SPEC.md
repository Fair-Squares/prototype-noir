# FSFTDex V3 — Anonymous Lit Order Book Spec

Status: **DRAFT for sign-off** (implementing it is a contract redeploy). Date: 2026-05-29.
Aztec v4.3.0 / Aztec.nr. Produced by a design panel (2 independent designs + an Aztec
feasibility review grounded in the aztec-contracts skill + MCP).

## Goal (locked by product owner)

A **public lit order book** with **price-time priority (FCFS)** where **both maker and
taker are unlinkable** to their orders/trades, matched **on-chain inside the placement
transaction** (no off-chain keeper/relayer script), settling at the resting (maker) price
either at one exact crossing price or filling resting orders in order.

> This is an **anonymous** order book, not a *private* one: order sizes/prices are public
> by design; **identity** is hidden. (Matches Aztec's own orderbook framing.)

## The two facts that shape the whole design

1. **A private function cannot read live `PublicMutable` state.** So the authoritative
   match + settlement must run in a **public** function and spend from a **public** balance.
   → Custody model: the **DEX holds escrowed funds in its own public token balance**.
2. **A contract spending its *own* balance needs no authwit.** The AIP-20 Token's
   `#[authorize_once("from","_nonce")]` requires `_nonce==0` when `from==msg_sender`. So the
   DEX settling resting makers from its own escrowed public balance needs **no live authwit
   from anyone** — this is what makes keeperless, offline-maker matching possible.

## Anonymity model

| Public by design (the lit book) | Hidden |
|---|---|
| per order: `seq`, side, price, original amount, live remaining, status, expiry, escrow-token; per match: `(taker_seq, maker_seq, fill, price)` | **who** owns each order; trader **balances**; the trade decisions |

What hides maker/taker:
1. place/match/cancel decisions execute in **private** — the address only exists inside the user's own circuit.
2. **No owner field on chain.** Orders are keyed by `seq`; auth is via `owner_tag = poseidon2([secret_owner_key, seq])`, a one-way function of a secret only the owner holds (kept in a private `OrderOwnerNote`).
3. **SponsoredFPC pays fees** → the L2 tx-sender is the FPC, not the trader. *(Hard requirement: any self-paid tx fully deanonymizes the trader.)*
4. The public matcher tail is `#[only_self]` → its `msg_sender` is the DEX itself (a fixed, anonymous value).
5. **Payouts are pushed to commitments** (`PartialUintNote`) whose recipient is committed privately and never appears as an address in public state.

**Honest limits:** anonymity is **set-size dependent** — it equals the distinct accounts routing through the same SponsoredFPC, further bounded by the fund's KYC-investor population. With one active trader in a window, the set collapses to one. Sizes/prices are visible; only identity is protected.

**Required fix (real bug in V2):** V2 published `poseidon2([owner, nonce])` (a *stable-per-user* value) to the public KYC revocation check, which **links all of a user's orders**. V3 must do the non-revocation check in the **private leg** against an anchor block and pass only the **anchor block number** to public. (Fallback if a private membership read isn't supported in v4.3.0: re-issue freshly-salted per-order credentials.)

## Storage

Custody = **Model A (DEX-as-public-custodian)**. Public book keyed by `seq:u64`; no address anywhere in public.

- Config: `admin/kyc_verifier/housing_fund: PublicMutable<AztecAddress>`, `fsft_token/eur_token: PublicImmutable<AztecAddress>`, `price_band_bps/max_ttl_blocks: PublicMutable<u32>` (advisory).
- `seq_counter: PublicMutable<u64>` — monotonic price-time key, **read-then-write in the public tail** (forge-proof; same idiom as `housing_fund.deposit_seq`). `order_id == seq`.
- Lit book (one `Map<u64, PublicMutable<_>>` per field): `o_side(u8)`, `o_price_bps(u64)`, `o_amount(u128)`, `o_remaining(u128)`, `o_status(u8: OPEN/PARTIAL/FILLED/CANCELLED/EXPIRED)`, `o_expiry(u32)`, `o_escrow_token(u8)`, `o_owner_tag(Field)`, `o_payout_head(u32)`.
- `o_payout_commit: Map<Field, PublicMutable<Field>>` keyed `poseidon2([seq, fill_idx])` — the pre-initialized `PartialUintNote` consumed for fill #`fill_idx`.
- Escrow audit (optional): `total_escrowed_fsft/eur: PublicMutable<u128>` invariants.
- **Private** (in each owner's PXE): `order_owner_notes: Owned<PrivateSet<OrderOwnerNote>>`, `OrderOwnerNote = {secret_owner_key: Field, seq: u64, side: u8, payout_token: AztecAddress, max_fills: u32}` — the only artifact tying a person to an order; `terminal_nullifiers: Map<Field, Owned<SingleUseClaim>>` (one terminal cancel/reclaim per order). Proceeds arrive as completed `UintNote`s in the owner's balance *under the Token contract*.

## Entrypoints

- `constructor(admin, kyc_verifier, housing_fund, fsft_token, eur_token, price_band_bps, max_ttl_blocks)` — wiring (V2 shape).
- `set_risk_policy(price_band_bps, max_ttl_blocks)` — admin advisory band/ttl.
- **`place_order(side, amount, price_bps, expiry_block, secret_owner_key, supplied_seq, escrow_authwit_nonce, max_fills, taker_recv_commitment, payout_commitments[MAX_FILLS], maker_seqs[MAX_FILLS], policy, hinted_kyc_note, kyc_anchor)`** `#[external("private")]` — the single core entrypoint. Private leg: prove KYC + **non-revocation privately** (pass only anchor block); escrow funds into the DEX public balance (`transfer_private_to_public(caller→DEX,…)`, one authwit); mint `OrderOwnerNote`; pre-initialize the receive-side + payout `PartialUintNote` commitments; compute `owner_tag`; `enqueue_self _place_and_match`.
- **`_place_and_match(…)`** `#[external("public")] #[only_self]` — the bounded on-chain matcher: validate `supplied_seq==seq_counter` (++); validate KYC anchor; `for i in 0..MAX_FILLS` over the frontend-supplied `maker_seqs` validating crossing+status+expiry+FCFS and settling each leg **from DEX custody with `_nonce=0`** to the maker's payout commitment; complete the taker's receive commitment **once** at end; rest the unfilled remainder as a new OPEN/PARTIAL row; refund BUY over-escrow.
- `cancel_order(hinted_owner_note, refund_commitment)` + `_apply_cancel` — owner proves the note privately, single-use terminal nullifier, `_apply_cancel` checks `o_owner_tag` (address-free auth) + refunds unfilled escrow to a commitment.
- `reclaim_expired(seq, hinted_owner_note, refund_commitment)` + `_apply_expiry_reclaim` — **owner-only** escrow reclaim of an expired order.
- `mark_expired(seq)` `#[external("public")]` — **permissionless pure status flip** (no escrow movement) so the lit book reads honestly; a caller gains nothing → harmless janitor, not a keeper.
- Views: `get_order(seq)`, `scan_book(side, start_seq, count)`, `get_orderbook_snapshot()`, `can_trade(user)`, `get_settlement_tokens()`, `get_my_orders(owner, page)`.

## Place-and-match flow (taker BUY crossing resting SELLs; SELL symmetric)

**Private leg** (taker's device, FPC-paid): assert valid; prove KYC + non-revocation against an anchor (pass only anchor block); `transfer_private_to_public(caller→DEX, ceil(amount*price/10000))` (the one authwit); mint `OrderOwnerNote`; pre-init `taker_recv_commitment` + `payout_commitments[]`; `owner_tag=poseidon2([secret_owner_key, supplied_seq])`; `enqueue_self`.
**Public tail** (sequencer, live book): `seq=seq_counter; assert supplied_seq==seq; seq_counter=seq+1`. Bounded loop over `maker_seqs[i]`: load maker; assert OPEN/PARTIAL, not expired, **crossing** (buy price ≥ sell price; or exact-price for policy 0), and **FCFS** (`o_seq[m] < seq` + non-improving price across candidates); `fill = min(incoming_remaining, o_remaining[m])`; settle: `transfer_public_to_commitment(DEX → maker payout commitment, fill*price, _nonce=0)`; decrement `o_remaining[m]`, set FILLED/PARTIAL; accumulate taker FSFT. After the loop, complete the **taker's** FSFT commitment once; if `incoming_remaining>0`, write a new resting row; refund BUY over-escrow surplus.

**Same-tx payout is feasible** (verified): completion uses `nullifier_exists_unsafe`, which sees the in-tx validity nullifier from the commitment initialized in the same tx's private leg — so the taker is paid *in* the placement tx. *(Must be reconfirmed in a TXE test before coding.)*

## Bounded matching + FCFS

`for i in 0..MAX_FILLS` (compile-time global; **start 4**, tune ≤ ~8 after gas measurement). Noir/AVM require statically-bounded loops. The frontend supplies `maker_seqs` from a public `scan_book` read; the contract **validates every entry** (never trusts it). Verified v4.3.0 ceilings (`constants.nr`): 32 enqueued calls, 63 public writes, 64 note-hashes/nullifiers, 6M AVM gas → ~120–200k gas/fill ⇒ ~6–12 fills theoretical; MAX_FILLS=4 conservative.
**Large orders:** fill what they can, then **rest the remainder** (PARTIAL); later crossing orders fill it incrementally; each resting order can be partially filled at most `max_fills` times before the owner reclaims+re-posts.
**FCFS honesty:** enforced by `o_seq[m]<seq` (time priority) + monotonic non-improving price across the supplied set (exact-price policy uses `price==taker_price`). **Limit:** this enforces FCFS *within the caller-supplied set*; it can't prove a better/older order elsewhere wasn't omitted. Optional mitigation: an O(1) `best_bid/best_ask` top-of-book pointer asserted against the first supplied candidate.

## Cancel / expiry
- **Cancel** (private, FPC): prove `OrderOwnerNote`, single-use terminal nullifier, `_apply_cancel` checks `o_owner_tag` + refunds the **unfilled** portion to a commitment (already-settled fills stay with the owner). Public event: `seq → CANCELLED, refund R`.
- **Expiry split** (satisfies no-keeper): `mark_expired` permissionless status flip (no money moves) + `reclaim_expired` owner-only escrow reclaim. The matcher refuses any maker with `block≥expiry`, so an expired order is dead to matching even before it's marked.

## Redeploy / migration impact
New contract **class + instance** (storage + ABI change; not an in-place upgrade). **Drop** V2 `order_status_v2` (owner-embedding commitment) + `match_order_private` (needed live authwits from both sides). **Replace** `OrderIntentNote` with `OrderOwnerNote`; amount/price move to the public book. **Add** seq + bounded matcher + payout-commitment vectors + `owner_tag` + `mark_expired`/`reclaim_expired` + lit-book reads. **Keep + FIX** the KYC gate (move non-revocation to a private anchor read). The DEX now **holds token balances** + calls `initialize_transfer_commitment`/`transfer_private_to_public`/`transfer_public_to_commitment` (all present in the vendored Token; DEX needs no minter role). Tokens/KYC/HousingFund are **reused** (re-link the new DEX address in bootstrap + testnet deploy). V2 orders are not migratable → cancel before cutover.

## Implementation notes (as built — `contracts/fsft_dex` V3)

Compiles on Aztec v4.3.0; `aztec test` green. Two robustness choices vs the spec above:
- **Payout = accrue-to-counter + claim** (decision #4 alternative, not per-fill push): the match loop does **pure public-state updates** (no token calls) accruing proceeds to per-`owner_tag` `claimable_fsft`/`claimable_eur` counters. The `PartialUintNote` commitment flow lives only in the isolated `claim(note, token)` path (DEX `initialize_transfer_commitment` → `transfer_public_to_commitment` self-spend, `_nonce=0`). This removes the same-tx-completion risk from matching, makes the loop cheap, and keeps payout fully anonymous.
- **Exact-price matching** for v1 (your "one exact price" option): a taker fills makers at *exactly* its price, so escrow == trade value exactly → trivially solvent (floor arithmetic everywhere). The `policy` arg is reserved for adding price-time "fill-in-order" (with price-improvement refund) later.
- **KYC fully private**: `kyc_verifier` is `PublicImmutable` so the private placement leg verifies the credential note's origin and publishes **no** per-user value (fixes the V2 linkable-revocation-commitment bug). On-chain non-revocation at placement is deferred (the credential-note existence is the gate).
- Constructor shape is **unchanged** from V2 → deploy scripts need no arg changes (just redeploy the new class).

## Decisions needed before implementation (open questions)
1. **FCFS soundness level:** hint-validated within the supplied set (+ optional O(1) top-of-book assertion) — *recommended* — vs strict global price-time across per-price-level queues (more storage + complexity).
2. **`MAX_FILLS`:** start 4; final value after local-network gas measurement.
3. **KYC non-revocation:** confirm a v4.3.0 private historical/membership read of the revocations map at an anchor (preferred) vs re-issuing salted per-order credentials.
4. **Maker proceeds delivery:** push to a per-fill commitment (better UX, more gas) vs accrue to a cheap `o_claimable_eur` counter pulled in a separate async claim.
5. **BUY over-escrow:** escrow at the buyer's limit price + refund the price-improvement surplus per tx (*recommended* — guarantees solvency).
6. **Self-cross:** forbid a taker matching a maker with the same `owner_tag`? (detectable, but reveals nothing.)
7. **SponsoredFPC strategy:** dedicated app FPC (smaller set, app control) vs shared community FPC (larger set) — ops/anonymity tradeoff.
