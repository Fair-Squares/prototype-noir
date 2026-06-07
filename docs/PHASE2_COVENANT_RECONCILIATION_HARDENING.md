# Phase 2 — real covenant · reconciled economics · production hardening

Plan for the three highest-leverage items identified after the frontend/brand work:

1. **Affordability covenant on-chain** — make the housing differentiator real, not modelled.
4. **Reconciled economics + a real NAV + a per-account history** — make the numbers credible.
5. **Deploy / proving / E2E / audit hardening** — make it pilotable with partners' money.

> **The honesty payoff (why this order matters).** The frontend already separates *real on-chain*
> from `ModelledChip` ("Modelled for demo"). Every item below **converts modelled → real**, which
> *deletes* a chip or fills an empty state. Workstream 1 retires the biggest modelled block (the
> covenant); Workstream 2 retires the "transaction history" empty state and the stale NAV; Workstream 3
> is what stands between a demo and a real pilot. The end-state is a UI with almost no modelled chips.

Grounding for every claim below is in the contracts at the cited `file:line`; the exploration that
produced these anchors is summarised inline.

---

## Workstream 1 — Affordability covenant on-chain (item 1)

> **STATUS — LANDED (2026-06), with a scope decision.** W1 shipped: the covenant
> is a votable proposal term (`Governance.set_proposal_covenant`), synced into the
> fund (`HousingFund.sync_proposal_covenant`), and **enforced** — `record_rent`
> **rejects** rent above the monthly ceiling. **The clawback path described in 1c
> below was deliberately DROPPED, not built.** Because FS rent is fixed by the ROR
> formula and capped by the covenant ceiling, rent can never exceed the agreed
> amount — so a "collect above the cap, then claw back the excess" recapture path
> is dead weight (and showing a clawback % for a mechanism that can't fire would
> violate the honesty rule). The `clawback_bps` field was removed from the
> `CovenantView` struct, storage, the setter signature, the API and the UI. The
> 1c/clawback prose below is kept only as the historical design. Remaining W1
> follow-ups: lock-expiry (maturity) enforcement and the optional `target_group`
> eligibility gate.

### Current state (grounded)
- The covenant (rent band, target group, lock years, clawback) is **frontend-only modelled metadata**
  in `frontend/src/lib/projectDossier.ts` (`AffordabilityCovenant`, lines 77–85, 191–198). `HousingFund`
  has **no covenant storage** of any kind.
- `Governance` proposals carry only `p_desc_hash`, `p_amount`, `p_status`, `p_proposer`,
  `p_created_block`, `p_deadline_block` (`contracts/governance/src/main.nr:63–70`). `create_proposal`
  takes `(description_hash, amount)` (L124–147). `execute_proposal` (L285–299, admin-only) just flips
  `PASSED → EXECUTED`; it does **not** call HousingFund.
- The capital flow starts at `HousingFund.open_distribution(proposal_id)` (`housing_fund/src/main.nr:610–672`),
  which reads the proposal status+amount from Governance via a view, snapshots deposit cursors, mints FSFT
  and the property-deed NFT.
- ROR exists: `ror_bps` (L254), `acquisition_value_by_property` (L256), `get_expected_monthly_rent` (L1611)
  — but it is **advisory**: `record_rent` (L936–959, keeper-posted) enforces **no ceiling**.

### Design: the covenant is a *votable, enforceable* proposal term
Members should vote on the covenant, not just the euro amount, and the protocol should enforce it.

**1a — Carry the covenant on the proposal (votable).**
Extend `create_proposal` to take covenant terms; store them on Governance.
```noir
// contracts/governance/src/main.nr — new per-proposal storage (parallel to p_amount)
p_covenant_hash:    Map<Field, PublicMutable<Field>, Context>, // poseidon2 of the full struct (audit anchor)
p_rent_ceiling_bps: Map<Field, PublicMutable<u32>,  Context>, // monthly rent cap, bps of acquisition value
p_lock_years:       Map<Field, PublicMutable<u16>,  Context>, // affordability lock length
p_clawback_bps:     Map<Field, PublicMutable<u32>,  Context>, // share of excess returned if breached
p_target_group:     Map<Field, PublicMutable<Field>, Context>, // hashed eligibility group (optional gating)

fn create_proposal(description_hash: Field, amount: u64,
                   covenant_hash: Field, rent_ceiling_bps: u32,
                   lock_years: u16, clawback_bps: u32, target_group: Field) -> u32 { ... }
```
Voting (`cast_vote_private`, L159–207) and `finalize_proposal` (L253–279) are **unchanged** — members
approve the proposal *including* its covenant.

**1b — Register the covenant on HousingFund at execution (immutable once funded).**
Add a Governance→HousingFund call so the covenant locks to the property when capital is committed.
```noir
// Governance.execute_proposal: after PASSED→EXECUTED, forward the covenant
let hf = HousingFund::at(self.storage.housing_fund.read());
self.call(hf.register_proposal_covenant(proposal_id, covenant_hash, rent_ceiling_bps, lock_years, clawback_bps, target_group));

// HousingFund — new storage + governance-gated setter, plus a lock-expiry block
d_covenant_hash / d_rent_ceiling_bps / d_lock_years / d_clawback_bps / d_target_group: Map<Field, …>
d_lock_expires_block: Map<Field, PublicMutable<u32>>  // set = current_block + lock_years*BLOCKS_PER_YEAR
#[external("public")] fn register_proposal_covenant(...) { assert(msg_sender == governance, "only governance"); … }
#[external("utility")] unconstrained fn get_proposal_covenant(proposal_id: u32) -> pub (Field,u32,u16,u32,Field,u32) { … }
```
Wire it into `open_distribution` (L610) so the covenant is bound at the same moment as the deed/NFT.

**1c — Enforce the rent ceiling + clawback at `record_rent`.**
```noir
// contracts/housing_fund/src/main.nr — record_rent (L936–959), add:
let ceiling_bps = self.storage.d_rent_ceiling_bps.at(property_pid).read();
if ceiling_bps != 0 {
  let acq = self.storage.acquisition_value_by_property.at(property_pid).read();
  let monthly_cap = (acq * ceiling_bps as u64) / 10000 / 12;
  // Breach path: if a keeper posts sustained rent above the cap, route the excess to the
  // clawback recipient (public partner) and flag the covenant, rather than silently accepting it.
  if amount_monthly > monthly_cap { enqueue _process_covenant_breach(property_id, excess, clawback_recipient); }
}
```
At lock expiry (`d_lock_expires_block`), the ceiling lifts (covenant matures) — a clean, auditable horizon.

**1d — (optional) Eligibility-gated participation.**
If a covenant sets `target_group`, add `cast_vote_private_gated` / a tenant-eligibility credential check so
covenant-specific access (e.g. key-worker) is provable **without revealing identity** — reuses the existing
hinted-note pattern (`cast_vote_private`, L159–207; KYC `issue_credential`).

### Frontend payoff
`projectDossier.ts` covenant fields become **on-chain reads** (`get_proposal_covenant`) →
`FundStats`/proposal carries the real covenant → `ReturnsCapPanel`/`ProjectDetailDossier` drop the
`ModelledChip` on rent band / lock years / clawback. The dossier shrinks to truly off-chain narrative only.

### Verification (W1)
`aztec test housing_fund` + `governance`: new tests — covenant carried on create, registered on execute,
`record_rent` rejects/claws-back above ceiling, ceiling lifts after `lock_expires_block`. Frontend Vitest
asserts the covenant now renders **untagged** (no ModelledChip) when on-chain.

---

## Workstream 2 — Reconciled economics + real NAV + per-account history (item 4)

### 2a — Per-account transaction history (the empty `/portfolio` state)
**Why empty:** the protocol emits **no events** (`grep`: no `encode_event`/`emit` in any contract). Notes
(`DepositNote`, `RewardClaimNote`, `OrderOwnerNote`) live only in each holder's PXE; claims are tracked by
**nullifiers**, not a feed. `frontend/src/app/portfolio/page.tsx:352–360` says exactly this.
**Plan (privacy-preserving):** emit **private events** the holder reads from their own PXE — one per
deposit / withdraw / claim_rent / reinvest / distribution-claim / trade — carrying `{type, amount, block,
epoch}`. Then `/api/portfolio` enumerates the caller's events and `/portfolio` renders a real history
ordered by block. (Fallback if private-event support is thin on the pinned Aztec version: a per-account
public log `Map<AztecAddress, BoundedVec<TxRecord>>` — simpler, but public; prefer private events.)

### 2b — Real NAV via the valuation oracle (stop NAV == deposits)
**Current:** `NAV = total_deposits` only; `get_valuation_public` (`housing_fund/src/main.nr:~1683`) reads
`last_asset_sale_price`/`last_token_price_bps`, which are **set once at issue time** (`open_distribution`,
L657–660) and never re-marked. The recursive circuit **already exists** at `proofs/recursive/housing_valuation`
but is **not wired** (see `docs/FUTURE_DEVELOPMENT_PLAN.md §3.2`).
**Plan:** add a **governance-gated** `set_valuation(total_nav, proof)` that verifies the recursive proof
(a quorum of valuers / signed appraiser feed, aggregated without per-property disclosure), writes the mark,
and stamps `last_valuation_block`. NAV then = deposits + marked property appreciation; FSFT NAV/share and the
DEX reference both read a *fresh* value.

### 2c — Economic coherence (the class of bug behind the DEX €225-vs-€1 issue)
The DEX reference fix already landed for sim; the **structural** version is: the DEX anchor
(`last_token_price_bps`) is a **stale snapshot** updated only at proposal execution, so it drifts from NAV.
Reconcile the model so **deposits → FSFT mint price → NAV/share → DEX reference** all tie out:
- Decide the canonical share-pricing rule (mint at NAV-per-share, or document the issuance-price model and
  keep the DEX explicitly on the issuance basis — the label already says "Last issuance reference price").
- Once 2b lands, point the DEX band at the **fresh** valuation, not the stale snapshot.
- Add a **reconciliation invariant test** (Noir + a frontend Vitest parity guard, like the existing
  `rewardsEmissionParity`) asserting `total_deposits / fsft_supply`, issuance price, and DEX reference agree
  within tolerance in both sim and live.

### Verification (W2)
New Noir tests for `set_valuation` (proof-gated, updates NAV) and the reconciliation invariant; a frontend
parity test; manual check that `/portfolio` shows a real history and `/dex` + Overview NAV agree.

---

## Workstream 3 — Deploy / proving / E2E / audit hardening (item 5)

### 3a — Land the deferred private-note E2Es — ✅ DONE (TS aztec.js harness)

> **STATUS — LANDED (2026-06).** All six private hinted-note flows now have passing e2e tests under
> `scripts/e2e/` (`npm run e2e:all`), built as **TypeScript aztec.js tests against the docker node** —
> NOT Noir `TestEnvironment` (which can't hint a contract-created note; see the finding below). Covered:
> `claim_reward_private`, `claim_rent_private`, `reinvest_rent_private`, `cast_vote_private`,
> `claim_distribution_private`, and the DEX `place_order`/`cancel_order`. Each is self-contained (mints
> the notes it consumes in-process), asserts a real numeric state delta, and asserts the single-use guard
> fires on a repeat. A shared `harness.ts` (connect/loadContract, revert-aware sends, `depositInProcess`,
> `openRentEpoch`, `runProposalToExecuted`, `allDepositNotes`, the `totalClaim` math mirror) keeps the
> six files consistent. The harness also caught + drove the `HousingFund.set_eur_token` bootstrap fix.
> See `scripts/e2e/README.md` and the "Private-flow E2E harness" section in CLAUDE.md.

Original plan (for reference) — each had cross-contract setup + public-path E2Es to extend:
- **Governance** `cast_vote_private` (happy / double-vote via SingleUseClaim / revoked-credential / tie) —
  `governance/src/test.nr:40–46`; extend `setup_with_investor`.
- **ProtocolRewards** `allocate_reward_private` → `claim_reward_private` (+ re-claim rejection) —
  `protocol_rewards/src/test.nr:152–158`; extend `setup_full`.
- **FSFTDex** `place_order → match → cancel/claim` (hinted KYC + token escrow + authwit) —
  `fsft_dex/src/test.nr:64–68`; extend `setup_linked`.
- **HousingFund** multi-note `claim_distribution_private` / `reinvest_rent_private` —
  `housing_fund/src/test.nr:215–217`.
These run in CI (`.github/workflows/tests.yml`) and raise real confidence in the private flows users hit.

> **Testing-approach finding (MCP research against v4.3.0 — supersedes the "extend the Noir test" framing above).**
> The hinted-note private flows must be tested in **TypeScript aztec.js e2e**, not Noir `TestEnvironment`:
> - The canonical "private fn takes a `HintedNote`" contracts upstream (`claim_contract`, `card_game`) have
>   **no Noir `TestEnvironment` test** — they're covered by **TS e2e** (`yarn-project/end-to-end/
>   e2e_crowdfunding_and_claim.test.ts`), where aztec.js builds the hint (`packAsHintedNote`).
> - Noir `TestEnvironment` can only hint a note at a **known storage slot** (the `aztec-nr` `history/test.nr`
>   MockNote pattern). There is no ergonomic way to hint a **contract-created** note (a KYC credential, a
>   deposit note) from a test, because you'd need the emitting contract's internal storage slot.
> - Therefore **`cast_vote_private` is the *hardest* starting point**, not the easiest: it hints notes from
>   *two other* contracts (KYCVerifier + HousingFund). `place_order` is similar (cross-contract + authwit).
>   The **same-contract** flows (`claim_reward_private` consuming ProtocolRewards' own `RewardClaimNote`;
>   `claim_distribution_private` / `reinvest_rent_private` consuming HousingFund's own `DepositNote`) are the
>   only ones even plausibly Noir-testable, and only if the contract exposes a utility that returns the hint
>   for the caller's own note (so the slot stays internal).
> - The project has **no TS contract-test harness today** (scripts are deploy/smoke only).
>
> **Revised W3a:** build a minimal **TS aztec.js e2e harness** against the local docker network (reuse the
> frontend's `EmbeddedWallet`/`serverWallet` + bootstrap-deployed addresses), then write the private-flow
> tests there (start with `cast_vote_private` — KYC credential + deposit note + a real vote, since the TS path
> builds hints natively). This is a real harness build, not a "extend the existing Noir test" quick win — the
> per-PR/holistic reviews and the covenant 1c test deliberately stayed on the **public** path for this reason.

### 3b — Testnet deploy hardening (`scripts/testnet-deploy-*.ts`)
Works today (SponsoredFPC `salt=0` account; 11 instances; `set_contracts`/`set_admin` wiring; KYC issuance →
`scripts/.testnet/contracts.json` + `frontend/.env.testnet`). Gaps to a real pilot:
- **Codegen missing** from `testnet-deploy-contracts.ts` (only `bootstrap-local-network.sh` runs it) — add
  the `aztec codegen` step before writing `.env.testnet`.
- **Address instability** — random salts; switch to **deterministic salts** (derived from a fixed seed) so
  redeploys keep stable addresses.
- **Key management** — secret is **plaintext** in `scripts/.testnet/account.json`; move to an encrypted key
  store / CI secret / vault.
- **Server/API blocked on testnet** — `frontend/src/lib/pxeUrl.ts:39–45` throws for `AZTEC_NETWORK=testnet`
  because no fee method is wired for server flows; wire `SponsoredFeePaymentMethod` for the server PXE.
- **Multi-user** — server wallet loads 3 hardcoded Schnorr test accounts (`serverWallet.ts:109`); for a real
  pilot, let users connect their own browser wallet instead.

### 3c — Real proving (ClientIVC)
`PXE_PROVER_ENABLED` defaults **false** locally (proverless, ~instant) and is read in
`frontend/src/lib/serverWallet.ts` + `docker-compose.yml`. For a credible pilot, flip to **true** on testnet
(real client proofs), provide the `bb` barretenberg binary, and budget ~4s/tx (raise API timeouts). No
contract/wallet code changes — proving is opaque.

### 3d — Audit prep (then external audit)
Fix the specific trust-surface findings before paying for an audit:
- `set_ror_bps` (L409) has no lower bound; `set_risk_policy` (dex L185) no **upper** band bound;
  `checkpoint_epoch` (rewards L197) **no double-checkpoint guard** (re-adds emission); no reentrancy guards on
  `claim_rent`/`claim_distribution`; `revoke_credential` keeps **no audit trail** of who/when; KYC public
  `verified`/`investor_role` maps leak the KYC set (M15).
Then run `/security-review` on the branch, and commission an **external audit** of the 5 contracts +
authwit/escrow flows before any real funds.

### Verification (W3)
`./scripts/aztec-test.sh` (now incl. private E2Es) green in CI; a full `testnet-deploy-*` dry run with
proving on; a clean `/security-review`; documented audit scope.

---

## Suggested sequencing (dependencies)
1. **W3a (private E2Es)** first — cheap, raises confidence, and you'll want them green *before* changing
   contracts in W1/W2.
2. **W1 (covenant)** — the headline feature; self-contained (governance + housing_fund).
3. **W2b → W2c (valuation oracle → reconciliation)** — 2c depends on 2b for the fresh NAV.
4. **W2a (history)** — independent; can land any time after W3a.
5. **W3b/3c (deploy + proving)** then **W3d (audit)** — last, once the contract surface is stable.

A natural milestone: **W3a + W1 = a credible "affordable-housing protocol" testnet demo** (real covenant,
private flows tested). **+ W2 + W3b/c/d = pilot-ready.**

## Risks / open questions
- **Private events** support depends on the pinned Aztec version (4.3.0) — confirm `#[private_event]` + PXE
  enumeration before committing to 2a's private path; the public-log fallback is the hedge.
- **Valuation oracle trust model** — who the valuers are / how the appraiser feed is signed is a governance
  decision, not just code.
- **Covenant clawback** — DROPPED (see the W1 status banner). FS rent is ROR-fixed and ceiling-capped, so
  it can never exceed the agreed amount; enforcement is by rejection, not recapture. No clawback recipient
  / legal counterpart is needed.
- Storage growth: per-proposal covenant maps + per-account history both add state; budget for it.
