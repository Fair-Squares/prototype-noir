# Phase 1.1 — Real backing: pluggable yield + rent ingestion

> **Status:** Implemented (first slice) · **Plan:** [`FUTURE_DEVELOPMENT_PLAN.md`](./FUTURE_DEVELOPMENT_PLAN.md) §3.1 / §8 item 1 · **Contracts:** `contracts/defi_vault`, `contracts/housing_fund`

## Why

The plan's #1 priority (§1.3, §3.1): *"FSFT is backed by property value, but the
only income stream in code is a fake 3% APY. There is no rent, no real DeFi, no
cash flow to holders."* Until the backing is real, every token mechanism in §4 is
built on sand.

### What the code actually was (verified)

- **There is no real DeFi vault.** `DeFiVault` was a stub: `accrue_yield(amount)`
  let the **admin mint arbitrary yield from nothing**. In practice it was never
  even called by the bootstrap/deploy scripts, and the frontend stopped reading
  it — NAV is `max(0, total_deposits)`. So the "3% APY" was dormant, fabricable,
  and disconnected.
- **`total_in_defi` is a bare counter.** `HousingFund.deploy_to_defi` increments
  it without calling the vault — capital is not actually routed anywhere.
- **No rent path existed.** There was no on-chain way to record collected rent —
  the cash flow that is supposed to justify *"earn the rent."*

## What this slice changes

Two honest, additive, tested changes. **No simulated yield is introduced; the
fake-yield path is removed.**

### A. `DeFiVault` → a pluggable yield-source seam (no fabricated yield)

`contracts/defi_vault/src/main.nr`:

- New storage `yield_source: AztecAddress` + admin setter `set_yield_source(addr)`
  + getter `get_yield_source()`. Zero = none (the honest default).
- `accrue_yield(amount)` is **no longer admin-callable**. It now requires a
  configured `yield_source` and asserts `msg_sender == yield_source`:
  - `assert(!source.is_zero(), "no yield source configured")`
  - `assert_eq(self.msg_sender(), source, "only the yield source can report yield")`
  So **the fund can never invent yield** — only a real, plugged-in adapter (a
  tokenized-T-bill / money-market position) can report realized yield. With no
  adapter, the vault holds principal at par and reports **zero** yield.
- Constructor signature is unchanged `(admin, yield_rate_bps)` (bootstrap and
  `testnet-deploy-contracts.ts` keep working); `yield_rate_bps` is now documented
  as *advertised/expected-rate metadata only*, never used to accrue.
- Tests (`contracts/defi_vault/src/test.nr`, 5): no yield/source at start;
  `accrue_yield` reverts with no source; admin **cannot** fabricate yield even
  after a source is set; the configured source **can** report real yield; the
  setter is admin-gated.

### B. `HousingFund.record_rent` — the real cash-flow primitive

`contracts/housing_fund/src/main.nr` (storage appended at the END so existing
slots — read by the slot-based frontend reader — do not shift):

- Storage: `total_rent_income: u64`, `rent_income_by_property: Map<Field, u64>`,
  `rent_keeper: AztecAddress`.
- `record_rent(property_id, amount)` — authorized to **admin or a designated
  keeper** (an oracle/keeper that posts collected rent per property); asserts not
  paused, positive amount; accrues to the per-property and lifetime aggregates.
  Rent only enters here, posted by an authorized party against a real collection
  — **never fabricated**.
- `set_rent_keeper(addr)` (admin); getters `get_total_rent_income()`,
  `get_property_rent(property_id)`, `get_rent_keeper()`.
- Tests (`contracts/housing_fund/src/test.nr`, +5): starts at zero; admin accrues
  per-property and total; unauthorized caller reverts; zero amount reverts; a
  designated keeper can post.

**Verification:** `aztec compile` + `aztec test` green for both crates; full V2
suite `./scripts/aztec-test.sh` → **5 passed, 0 failed**.

## The accounting model & the honesty boundary

- Like `deposit`, `record_rent` is **counter accounting**: it records the rent
  collected. Moving the actual EUR token is orchestrated off-contract (the API
  layer / keeper), exactly as deposits already work in this prototype.
- Rent income is **transparent** (public aggregate) and is intended to **back
  NAV**. This slice exposes the number; it does **not** yet fold it into the
  NAV-per-FSFT shown in the UI, nor distribute it to holders. Those are the next
  steps below — called out so nothing is silently faked.

## What is intentionally NOT done yet (the next step)

In strict trust-priority order (each turns a *modelled* demo number into a *real*
enforced one):

1. **Wire rent into NAV (next step — smallest, highest-value).** Surface
   `get_total_rent_income()` in `FundStats`/`/api/fund/stats` and compute
   `NAV = total_deposits + total_rent_income` (and NAV-per-FSFT from it), with a
   `record_rent` keeper script under `scripts/`. This makes the demo's modelled
   "earn the rent" line a **real on-chain figure** end-to-end.
2. **Rent → claimable distribution.** Let FSFT holders claim accrued rent as EUR
   yield (reuse the FIFO + small-floor share machinery, or a simpler pro-rata
   on a rent epoch), so rent reaches holders, not just NAV.
3. **Capped-return in-circuit (§4.0).** Turn the demo's D2 *display* overlay into
   enforcement: cap the per-investor payout and route the surplus to an on-chain
   affordability reserve note/pool. *Do this before staking/fees — every other
   mechanism must respect the cap.*
4. **Real yield adapter.** Implement one `yield_source` adapter (tokenized
   T-bill / money-market) against the seam added here, and route idle capital
   through the vault (`deploy_to_defi` actually calling `DeFiVault.deposit`).
5. **Redemption floor (§3.3).** A reserve-funded `redeem_request` /
   `process_redemptions` so retail can exit at NAV-capped-by-reserve.

## Equity-gate check (§0.6.1)

- **(a) Doesn't inflate land/house prices** — rent is income on already-acquired
  affordable homes; no new credit channel.
- **(b) Improves/measures distributional equity** — rent is tracked per property
  and is destined to flow through the same small-depositor-floored distribution.
- **(c) Rate-resilient** — real rent cash flow + the (next) reserve is precisely
  what makes the capped-return promise survivable across a cycle; the fake yield
  it replaces was not resilient, it was fictional.

## Note on generated artifacts

The committed `frontend/src/artifacts/DeFiVault.ts` wrapper is autogenerated and
already flagged dead in `docs/TODO.md`. It still lists `accrue_yield` (the name is
unchanged, only its authorization changed) so nothing breaks; re-run
`aztec codegen` if/when the wrappers are refreshed.
