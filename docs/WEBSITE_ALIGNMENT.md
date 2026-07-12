# Website ↔ prototype alignment

*Written 2026-07-12. Sources: https://fair-squares.nl (live `llms.txt`, `/how-it-works`,
`/whitepaper`, checked against the `website-v2` repo, branch `feat/fair-squares-redesign`)
and this repo at `854f446`. Companion to the 2026-07-12 full-stack review (§3.1).*

The question this document answers: **does the prototype fulfill what fair-squares.nl
promises?** — and, in both directions, what should change so the two tell the same story.

---

## 1. Verdict

**The prototype fulfills the website's *financial core* and dramatically over-delivers on
privacy, but implements roughly half of the published five-step journey.** Steps 1 and 3b
(housing fund, investor vote) are real and stronger than described. Steps 2, 4, and 5
(asset onboarding, bidding, tenant matching) do not exist on-chain. Meanwhile the website
never mentions the prototype's two most defensible features — the Aztec privacy layer and
the anonymous secondary market — and still carries Polkadot-era framing ("application-
specific blockchain", "90% of tokens", "token-weighted voting") that no longer matches
the architecture or the tokenomics.

---

## 2. Claim-by-claim scorecard

Legend: ✅ fulfilled · ◐ partial / different model · ✗ not implemented

| # | Website claim (source) | Status | Reality in this repo |
|---|---|---|---|
| 1 | Community housing fund; deposit & withdraw anytime (journey step 1) | ✅ | `HousingFund`: public + private deposit paths, KYC/investor-gated, FIFO + 30% small-depositor floor, H2 withdraw retraction. Caveat: the withdraw-lockout bug (§3.1 item 1) must be fixed for "withdraw at any time" to be true. |
| 2 | Rents "at least 20% below market" (canonical claim, home + llms.txt) | ◐→✅ | *(Corrected 2026-07-12 — the enforcement instrument exists.)* The W1 affordability covenant (`rent_ceiling_bps`, voted with the proposal, immutable once attached) is enforced on-chain in `record_rent`: monthly rent ≤ `acq × ceiling_bps / 10000 / 12`. The 20% is the protocol's **baseline**; what's missing is only the market-rent link — the ceiling is relative to acquisition value, the market reference never enters the chain or UI, so the ≥20% relationship is set off-chain and not demonstrated in the app. Closing plan: `JOURNEY_COMPLETION_PLAN.md` J3. |
| 3 | Capped ~3% social return (canonical claim) | ✅ | `ror_bps` is on-chain and the `/learn` hero + calculator show the **real** value (honesty-by-design, `ModelledChip` for everything modeled). Reward ladder is `static_assert`-bounded. Caveat: the income behind it is still simulated (DeFiVault yield stub; rent payer is a demo actor). |
| 4 | Tokenized assets, fractional ownership per property (journey step 4, whitepaper step 3) | ◐ | Deliberately different model: FSFT is a **fund-share token with NAV per share**, not per-property fractional tokens. Property lifecycle is `record_asset_sale` + property NFT. The model is arguably better (diversified, liquid) but it is not what the website describes. |
| 5 | Two-stage assessment: Housing Council review (journey step 3a) | ✗ | No council role, no appraisal/technical-report workflow on-chain or in the app. Proposals carry only property + amount + deadline. |
| 6 | Two-stage assessment: investor vote (journey step 3b) | ✅+ | Stronger than advertised: KYC-gated **private secret ballot** (DepositNote proof + single-use nullifier), quorum, deadline, permissionless execution, affordability covenant (`set_covenant`, `lock_years`) recorded on the proposal. Caveats: stale-note voting bug (§3.1 item 4); website says "token-weighted", prototype is one-vote-per-investor — the prototype's rule is the more equitable one. |
| 7 | Smart bidding algorithm matches fund to properties (journey step 4) | ✗ | No bidding mechanism. Capital deployment = proposal → vote → execute → distribution. |
| 8 | Tenant matching via housing corporations; management rights (journey step 5) | — | **Dropped by owner decision 2026-07-12** — the tenant flow leaves the journey on both surfaces. Website removal tracked in Fair-Squares/website-v2#16; the tenant items in `FUTURE_DEVELOPMENT_PLAN.md` (§3 Phase 2, §4.4) are superseded. |
| 9 | "90% of tokens reserved for community, earned through participation" (whitepaper) | ◐ | Doesn't map to current tokenomics. FSFT has no fixed supply (minted per distribution); the participation-earned pool is `ProtocolRewards`' fixed 8M over 120 epochs (40/40/20 deposit/holding/governance). Participation-based ✅, "90%" ✗ — no denominator exists that makes the figure true. |
| 10 | Verified digital identity (how-it-works "under the hood") | ✅ | `KYCVerifier` with private credential notes + revocation, investor roles, zkPassport flow in the frontend. |
| 11 | Privacy-centric by design (how-it-works "under the hood") | ✅✅ | The prototype's strongest area and far beyond the site's one sentence: private deposits, secret ballots, anonymous DEX (`owner_tag`, no addresses in public state), private reward claims, documented threat models (M-series). |
| 12 | Transparent, auditable on-chain economics (llms.txt, whitepaper) | ✅ | Public aggregates + NAV fields (`navEur`, `navPerFsftEur`), permissionless distribution lifecycle. Caveat: NAV is stale between `record_asset_sale` calls — no oracle (honest gap already logged). |
| 13 | "Decentralized, application-specific blockchain" (whitepaper, "why a blockchain?") | ✗ | Architecture is **Aztec L2 smart contracts**, not an app-chain. Substrate-era framing; the website should say so, not the prototype. |
| 14 | Capital converted into stable tokens (whitepaper step 1) | ◐ | Demo EUR token (AIP-20). Real stablecoin (e.g. EURe) integration is future work. |
| 15 | Fair rental contracts with a path to build equity (whitepaper step 5) | ◐ | Rent model enforced on-chain ✅; tenant path-to-equity ✗ (planned). |
| 16 | "Try the protocol on the public testnet" (how-it-works CTA) | ◐ | proto.fair-squares.nl runs the stack, but testnet deploy hardening (W3b) is still queued; day-to-day the prototype targets local-network. The CTA is slightly ahead of reality. |

**Score: 5 fulfilled (one over-delivered), 6 partial, 4 not implemented, 1 website-side error.**

---

## 3. Prototype improvements (to fulfill the website)

### 3.1 Fix first — correctness bugs that break already-claimed features

Found in the 2026-07-12 skills-driven review; each invalidates a scorecard ✅ if left open.

1. **Withdraw lockout**: `housing_fund/src/main.nr:539-556` — retraction loop scans only
   record indices 0–63; users with 64+ records can never fully withdraw → falsifies
   "withdraw at any time". Fix: per-user `first_live_record_index` cursor.
2. **u128→u64 truncation** (two sites): `protocol_rewards/src/main.nr:354,430` (defeats
   the 8M pool cap) and `housing_fund/src/main.nr:1139,1183` (private-deposit invariant +
   FIFO blanket). Assert `amount <= u64::MAX` before every narrowing cast.
3. **DEX TTL never enforced**: `fsft_dex/src/main.nr:212-344` — orders can rest forever;
   also assert `price_band_bps <= 10000` so one admin typo can't brick the book.
4. **Stale-note voting**: `governance/src/main.nr:200` — fully-withdrawn users keep voting
   → falsifies "investors vote". Use the non-nullification history proof.
5. **False-success API routes**: 12 of ~15 write routes ignore revert outcomes; deposit is
   non-atomic (EUR transfer and `deposit_private` are separate txs). Use
   `getAztecTxOutcome` everywhere + `BatchCall` for transfer+deposit.

### 3.2 Close the journey gaps (what the website sells that the demo can't show)

Ordered by (website visibility × build cost), consistent with `FUTURE_DEVELOPMENT_PLAN.md`:

1. **Link the covenant to a market-rent baseline** *(small — corrected 2026-07-12)* —
   the rent ceiling is already enforced on-chain; add the appraiser-attested
   `market_rent_ref` at onboarding, assert `ceiling ≤ market_ref × 80%` when the
   covenant is attached, and show "market €X → capped €Y (−Z%)" on fund/property views.
   Spec: `JOURNEY_COMPLETION_PLAN.md` J3.
2. **Asset onboarding dossier** *(medium)* — journey step 2. A property submission flow
   (documents hashed on-chain, appraisal value, technical report) feeding the proposal.
   Matches the plan's §2.0 "project-finance dossier" wedge.
3. **Housing Council role** *(small-medium)* — journey step 3a. A council credential type
   in `kyc_verifier` + a council-approval gate before a proposal opens for the investor
   vote. Two-stage assessment then exists end-to-end.
4. ~~Tenant loop / rent-to-equity~~ — **dropped by owner decision 2026-07-12**
   (website removal: Fair-Squares/website-v2#16).
5. **Matching queue ("bidding")** *(medium)* — implement step 4 as deterministic
   priority matching (council quality score × covenant discount, permissionless
   `match_next()`), not an auction. Spec: `JOURNEY_COMPLETION_PLAN.md` J4.
6. **Testnet deploy (W3b)** *(queued already)* — makes the "public testnet" CTA true.

*The full build-out of §3.2 — including the journey UX and portfolio overview the owner
asked for — is specified in `JOURNEY_COMPLETION_PLAN.md` (J1–J6, with sequencing).*

### 3.3 Trust infrastructure (so fulfilled claims stay credible)

- NAV freshness: attested valuation updates between sales (recursive `housing_valuation`
  circuit is already scaffolded in `proofs/`).
- Redemption floor / exit queue (plan §4.6) — "withdraw anytime" for FSFT holders, not
  just fund depositors.
- Trust-minimized reward weights via the `rewards_weights` circuit (replaces admin
  `set_user_epoch_weights`).

---

## 4. Website improvements (to match the prototype)

For the `website-v2` repo; the prototype is *ahead* of the site on several fronts.

1. **Tell the privacy story.** The site's one "privacy-centric by design" card undersells
   the actual differentiator: private balances, secret ballots, anonymous trading, private
   reward claims — "confidential but compliant" on Aztec. This is the wedge over generic
   RWA platforms and it is *built*; a short "under the hood" section or whitepaper
   subsection naming Aztec/zero-knowledge proofs would make the claim concrete.
   (Keep the no-crypto-hype voice; the honest framing is exactly the repo's M-series
   threat-model tone.)
2. **Retire the app-chain framing.** Whitepaper "decentralized, application-specific
   blockchain" → "smart-contract protocol on a privacy-preserving L2 (Aztec)". The
   "why a blockchain?" box stays valid as-is.
3. **Fix the tokenomics claim.** "90% of tokens reserved for community" has no referent in
   the current design. Honest replacement: fund shares (FSFT) are minted only against
   deposits at NAV; a fixed 8M reward pool over 10 years is earned through participation
   (deposits, holding, governance) — with the small-depositor floor as the equity story.
4. **Describe the fund-share model.** Journey step 4 promises per-property fractional
   ownership + bidding; the built model is diversified fund shares with NAV per share and
   property-level governance votes. Update step 4 (and whitepaper step 3) or explicitly
   label the difference as roadmap.
5. **Mention the exit story.** The site never addresses "how do I get out?" — the
   prototype has an anonymous order book with a fund-valuation price band. One sentence
   under the impact calculator or in the whitepaper would pre-empt the most common
   investor question.
6. **Voting accuracy.** "Token-weighted voting" → one-vote-per-verified-investor secret
   ballot (arguably a *better* story for the equity narrative; quadratic/capped weight is
   on the roadmap).
7. **Point GitHub at the active code.** llms.txt and footer link
   `github.com/Fair-Squares/fair-squares` (the archived Substrate repo); link the org or
   `prototype-noir` so "transparent and auditable" leads somewhere current.
8. **Soften "public testnet"** in the how-it-works CTA to "live prototype" until W3b
   lands (then flip it back, loudly).
9. **Impact calculator provenance.** The prototype's `/learn` page fetches the real
   on-chain ROR and labels modeled figures with a chip; the website calculator states
   ~3% statically. Consider the same honesty device ("illustrative model" caption) —
   cheap, and consistent with the sandbox-cohort compliance posture.

---

## 5. Suggested order

1. §3.1 fixes (correctness — small, high stakes) and website items 2/3/6/7/8 (copy-only).
2. §3.2 items 1–3 (affordability surface, dossier, council) — closes the visible journey
   gap for demos; then website step-4 copy can stay as-is.
3. §3.2 item 4 (tenant loop) + website privacy/exit sections (items 1/5) — the
   differentiator, told on both surfaces at once.
4. §3.3 trust infrastructure alongside the W3b testnet deploy.
