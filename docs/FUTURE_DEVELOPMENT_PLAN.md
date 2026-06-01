# Fair Squares — Future Development & Growth Plan

> **Status:** Strategy draft · **Date:** 2026-05-30 · **Branch:** `claude/housing-protocol-plan-nUhcP`
>
> **Purpose.** This document answers three questions the project must get right
> to matter: (1) what should we build next that meaningfully advances an
> *equitable* housing protocol, (2) will this attract and retain real
> users — tenants, small savers, and larger investors — by offering them
> something they cannot get elsewhere, and (3) what token and crypto-economic
> mechanisms turn that user base into a durable, self-reinforcing flywheel.
>
> It is grounded in (a) the existing outreach material in
> [`docs/outreach/`](./outreach/) (the Netherlands housing-problem anthem,
> partner-target list, and contact persons), (b) the strategy docs already in
> `docs/` (`pilot-one-page-thesis.md`, `pilot-term-sheet.md`,
> `cpb-housing-affordability-financing-brief.md`, `production-path.md`,
> `PHASE3_TOKEN_STANDARDIZATION.md`, `frontend-redesign-design-doc.md`),
> (c) a direct reading of the on-chain contracts in `contracts/` and the
> frontend in `frontend/`, and (d) the peer-reviewed housing-finance literature
> (see §0.6) on *what an equitable protocol should optimize for*.

---

## 0. TL;DR — the one-paragraph thesis

Fair Squares already has the *hard* part working: a privacy-preserving,
governance-driven housing fund on Aztec where KYC'd savers deposit EUR, receive
property-backed **FSFT** shares minted by a fair FIFO + small-depositor-floor
formula, vote privately on acquisitions, earn epoch-based protocol rewards, and
trade on an anonymous lit order book. What it does **not** yet have is the
economic *backing loop* that makes those tokens worth holding for a tenant or a
pension fund: a real (not simulated) yield source, a credible Net Asset Value
oracle so the FSFT price means something, a tenant-facing benefit that turns
renters into stakeholders, and the legal/redemption rails that let institutional
euros enter and exit with confidence. The plan below sequences those four
missing pieces, then layers on the token mechanisms (staking, fee capture,
redemption floor, rent-to-own) that convert one-time depositors into recurring,
aligned participants.

---

## 0.5 The single most important finding: respect the documented strategic pivot

Reading the outreach material end-to-end (`docs/outreach/*` + `pilot-one-page-thesis.md`
+ `production-path.md` + `cpb-housing-affordability-financing-brief.md`) surfaces a
**deliberate pivot the team has already made** — and which the original protocol
prototype predates. This plan must build *with* it, not against it:

| Old framing (the prototype) | Current documented framing (the pivot) |
|---|---|
| "We tokenize real estate." FSFT shares, a DEX, rewards farming. | **"Van maatschappelijk wenselijk naar financierbaar."** A *capped-return viability-gap* capital layer + a shared, transparent **project dossier**. |
| Lead with crypto/privacy. | **Do NOT lead with tokenization.** Lead with affordable-housing *finance readiness*. Crypto is "digitale infrastructuur voor transparantie, governance en rapportage," mentioned last. |
| Uncapped NAV upside, secondary trading. | **Capped 3–4% net return**, 15–25 yr affordability covenant, clawbacks, anti-speculation. Excess upside → affordability reserve / tenant / public partner. |
| Investors are the customer. | The *first* customers are **municipalities, woningcorporaties, and wooncooperaties** with a documented `onrendabele top` (unprofitable top slice). Investors come *after* a credible project exists. |

**The wedge the docs identify (this is the feature to build):** a
**privacy-aware project-finance dossier / "deal room"** that makes one affordable
project's *financing gap* legible to all parties at once — budget, financing mix,
public subsidy, member capital, loans, guarantees, affordability covenant,
milestones, use-of-funds reporting, and impact metrics — with privacy-preserving
*eligibility* checks (e.g. key-worker status for De Walvis) where they matter.
This is the highest-leverage near-term feature for *this* project because it is
what every partner in `netherlands-pilot-partner-targets.md` actually asked for,
and it is exactly what the protocol's Aztec primitives (public aggregates +
private/attested detail, KYC credentials, governance) are uniquely good at.

**What this means for the rest of this plan:**
- Promote the **project dossier (§2.0)** to the *first* near-term build — ahead
  of the token-economic layer.
- Reframe the protocol's existing money-plumbing (HousingFund/FSFT/DEX/Rewards)
  as the **capped-return capital layer** that plugs *into* a dossier once a real
  project and legal wrapper exist — not as the headline.
- Keep the §4 token mechanisms (the user explicitly asked for a tokenomics
  review) but **stage-gate them behind legal structure + a live project**, per
  the docs' "technology posture: tokenisation should wait."

The Dutch facts the docs let us cite safely (use these, not invented numbers):
~**396k**-home shortage (ABF/Primos 2025); **900k** new-homes target through 2030
(⅔ affordable); **€19.4bn** corporation funding shortfall on a €115bn task to
2034; SVH/Haaglanden **€3.5bn** regional gap (40% of investment infeasible);
SVn **Fonds Coöperatief Wonen** €60.6m; Zuid-Holland's first direct corporation
subsidy (Woonbron, Dirck Hoffblok). CPB caveat: **broad subsidies leak into land
prices** when land/permits are the real bottleneck → fund *documented project
gaps*, not vague ambition.

---

## 0.6 The academic evidence base — what the research says we should improve on

Beyond the Dutch-specific CPB/ABF material, an external literature review
("Research for me how to fix housing on a financial level", indexed at
[sci-bot.ru/research-for-me-how-to-19f4](https://sci-bot.ru/research-for-me-how-to-19f4))
surfaced the peer-reviewed finance literature on housing affordability. It is a
**secondary aggregator**, so the DOIs below are the citation of record (verify
before quoting externally), and the in-repo CPB/ABF sources remain primary for
any Dutch claim. But the consensus it reflects sharpens *what an equitable
housing protocol should actually optimize for* — and, usefully, almost every
finding maps onto a concrete Fair Squares design decision.

| # | Source (DOI) | Core finding | What it means Fair Squares should improve on |
|---|---|---|---|
| 1 | Ryan-Collins 2019, *Breaking the housing–finance cycle* (10.1177/0308518x19862811) | Affordability + wealth-inequality crises are driven by a **feedback cycle between finance and landed property** — cheap credit capitalizes into land/house prices. | Fair Squares must **not** be one more credit channel that inflates prices. The capped-return + anti-speculation covenant (§4.0) is precisely the mechanism that breaks, rather than feeds, this cycle. Make "we do not bid up land" a measurable, on-chain covenant. |
| 7 | 2020, *Effect of housing supply regulation on affordability* (10.1016/j.regsciurbeco.2018.03.007) | **Supply regulation raises average house prices and rents.** | Reinforces the docs' tilt to **transformations / splits / rooftop additions** (adding homes with the least land/permit friction). Prioritize dossier templates and capital products for *net-new-supply* projects; track "homes enabled" as the headline KPI. |
| 8 | 2020, *How effective is macroprudential policy? EU lending restrictions* (10.1016/j.jhe.2020.101694) | **LTV / DSTI caps** measurably restrain house-price/credit spirals. | Confirms "help households borrow more" is the wrong lever. Fair Squares is **supply-side capped capital**, not consumer leverage — and could *expose* effective LTV/coverage of each project in the dossier so funders see prudence, not gearing. |
| 9 | 2023, *How well placed are households for interest-rate increases* (10.1016/j.eap.2022.11.004) | Household balance sheets are **rate-fragile**; affordable rents lower project income exactly when rates rise. | Validates the §1 gap analysis: **real, rate-resilient cash flow** (rent ingestion + a conservative yield source, §3.1) and a **redemption reserve** (§3.3) are what make capped-return capital actually survivable across a cycle. |
| 5 | 2019, *Neighborhood Affordability and Housing Market Resilience* (10.1080/01944363.2019.1647793) | Affordability is tied to **foreclosure/financial resilience** at the neighborhood level. | Argues for the **affordability-covenant + impact dashboard** (§4 item 11) to track resilience, not just price — and for the small-depositor floor / rent-to-equity that keep residents financially anchored. |
| 2,3,4 | 2018–2020 affordability syntheses (10.1080/12265934.2020.1713864; 10.1080/19491247.2019.1662639; 10.2139/ssrn.3298993) | The field's open problem is **distributional**: *who* gets the affordability, and measuring it. | Fair Squares' edge is exactly here: the **FIFO + small-depositor floor** and **rent-to-equity** are distributional-equity mechanisms, and the privacy layer lets us prove *who benefited* in aggregate without doxxing individuals. Build the impact metrics to report distribution, not just totals. |
| — | Land value taxation thread (recurring in the review) | **LVT** captures land-value uplift to the public rather than to speculators. | New idea not in the repo: a Fair Squares-native analogue is **routing excess-over-cap upside to an affordability reserve / public partner** (already in §4.0) — frame it explicitly as on-chain "value capture for affordability," philosophically aligned with VrijCoop's de-speculation model. |
| 6 | 2004, *Is Housing Unaffordable?* (10.1257/089533004773563494) | Contrarian: over a long horizon, little evidence owner-occupied housing became *less* affordable. | Keeps us honest: **don't over-claim a permanent crisis.** Match the docs' discipline — fund *documented, specific* project gaps, not a generalized "housing is broken" narrative. |

### 0.6.1 Three principles this evidence locks in for "the equitable protocol"

1. **Break the finance–land feedback loop, don't feed it.** Every capital
   product must be capped, covenant-bound, and barred from bidding up land
   (sources 1, LVT). This is the *defining* difference between Fair Squares and a
   yield-chasing RWA fund — and it should be enforced in code (§4.0), not just in
   marketing.
2. **Optimize for net-new affordable supply and its distribution.** Because
   supply regulation raises prices (7) and the open research problem is
   distributional (2,3,4), the protocol's headline metrics are **homes enabled**
   and **who got the affordability** — surfaced via the dossier (§2.0) + impact
   dashboard, with privacy-preserving aggregates.
3. **Engineer rate-resilience explicitly.** Because households and affordable
   projects are rate-fragile (9) and resilience predicts outcomes (5), the
   real-yield (§3.1) and redemption-reserve (§3.3) work is not optional polish —
   it is what makes the capped-return promise credible through a downturn.

These principles are added to the §6 "definition of done" checks: a feature is
on-strategy only if it **(a)** does not inflate prices, **(b)** improves or
measures distributional equity, and **(c)** is rate-resilient.

---

## 1. Where we are today (verified against the code)

A short, honest inventory so the plan builds on reality, not the README.

### 1.1 Contracts (`contracts/`)

| Contract | What it does today | Token / value mechanic |
|---|---|---|
| **HousingFund** (`housing_fund`) | Pools EUR deposits (public + private paths), KYC-gated; mints FSFT pro-rata via **FIFO + 30% small-depositor floor**; routes idle capital to DeFiVault; opens permissionless distributions after a governance proposal executes. | FSFT minted = proposal amount; share = `fifo_share(cum_before, amount, cap)` + `small_share(...)`. HousingFund is the **immutable sole minter** of FSFT. |
| **FSFTDex** (`fsft_dex`) | Anonymous **lit order book**, FSFT↔EUR, KYC-gated. Identity hidden via `owner_tag = poseidon2([secret_owner_key, seq])`; settlement to claimable balances with **no addresses in public state**. Exact-price matching, ≤4 fills/tx, price band anchored to fund valuation. | Price in basis points; EUR = `FSFT * price_bps / 10000` (floored → solvent by construction). |
| **ProtocolRewards** (`protocol_rewards`) | 120-epoch (10-year) emission of an 8M pool; per-epoch split **40% deposit-weight / 40% FSFT-holding / 20% governance**; private claim via nullified `RewardClaimNote`. | Emission declines from ~13% → ~8% of annual pool. Admin-driven weight allocation. |
| **Governance** (`governance`) | Proposals (property + amount, deadline, quorum). **Private secret-ballot voting** (prove KYC + a DepositNote, single-use nullifier → 1 vote/proposal). Execution is permissionless and triggers HousingFund distribution. | No token mechanic; gates capital deployment. |
| **KYCVerifier** (`kyc_verifier`) | Dual path: legacy public flags + V2 **private credential notes** (`KycCredentialNote`) with a revocation map. | Gating layer for every other contract. |
| **DeFiVault** (`defi_vault`) | **Yield stub.** Tracks principal + accrued yield; `accrue_yield()` simulates ~3% APY. **No real DeFi integration.** | This is the single biggest economic gap (see §3.1). |

Plus vendored `aztec-standards` (AIP-20 token, NFT, escrow, dripper) and three
recursive-proof circuits in `proofs/recursive/` (housing valuation, FSFT holder,
rewards weights) — infrastructure for future on-chain NAV / eligibility proofs.

### 1.2 Frontend (`frontend/src/app/`)

User-facing Next.js app (not an admin console): Overview, Projects/Fund, Invest,
Portfolio, Governance, Trade (demoted), Rewards, Verification (KYC/zkPassport),
Reference, Explain. Design system is token-based (`globals.css` `@theme`, `ui/`
primitives, Plus Jakarta Sans). Production path reaches a **testnet deploy**
(CLAUDE.md "Stage 6.5") with `testnet-deploy-*.ts` scripts.

### 1.3 The honest gaps

1. **Yield is simulated.** FSFT is "backed by property value," but the only
   income stream in code is a fake 3% APY. There is no rent, no real DeFi, no
   cash flow to holders.
2. **No live NAV oracle.** FSFT price relies on governance calling
   `record_asset_sale()`. Between sales the price is stale; the DEX band floats
   on a snapshot. A holder cannot trust the mark.
3. **No redemption / exit guarantee.** You can sell FSFT on the DEX *if there is
   a buyer*. There is no protocol-level redemption floor or queue. Illiquidity
   kills retail trust.
4. **Tenants are absent from the token loop.** The protocol is investor-centric.
   The outreach anthem is about the *housing crisis* — i.e., tenants — yet a
   tenant gets no on-chain benefit, no path to ownership, no reason to show up.
5. **Admin-heavy reward weighting.** `set_user_epoch_weights` is admin-driven;
   not yet trust-minimized via the recursive `rewards_weights` circuit.
6. **Token standardization unfinished.** `PHASE3_TOKEN_STANDARDIZATION.md`
   tracks moving fully onto AIP-20 semantics; until done, integrations and audits
   are harder.

---

## 2. Will it attract users? The demand thesis

The Netherlands outreach material frames a real, acute problem (housing
shortage, unaffordable purchase prices, long social-housing waits, capital that
wants housing exposure but lacks a clean retail vehicle). Fair Squares can win
**only if each persona gets something they cannot get elsewhere.** Map every
build item to a persona benefit or cut it.

### 2.1 The three personas and their "unfair advantage"

| Persona | Pain today | What Fair Squares uniquely offers | Hook that drives signup |
|---|---|---|---|
| **Small saver / would-be first-time buyer** (priced out of the market) | Can't afford a deposit; savings earn ~nothing; locked out of housing upside. | Buy **€50–€500** of property exposure (fractional FSFT), with a **small-depositor floor** that *over*-allocates to the little guy — explicitly equitable. Privacy by default. | "Own a brick. Earn the rent. Vote on what we buy." |
| **Tenant in a fund-owned property** | Rent leaves, builds zero equity; no voice. | **Rent-to-equity**: a slice of rent paid converts to FSFT (see §4.4). Tenant becomes part-owner of the building they live in and votes on it. | "Your rent finally builds *your* equity." |
| **Institutional / impact investor** (pension funds, housing-corporation treasuries, family offices in the partner-target list) | Wants residential exposure + measurable social impact, but needs compliance, auditability, and exit. | KYC-gated, privacy-preserving, **auditable on-chain NAV + impact metrics**; clean ESG story (affordable units, tenant ownership); programmatic redemption. | "Verifiable affordable-housing yield with a paper-trail your auditor accepts." |

### 2.2 Why crypto/ZK is not gratuitous here

The privacy layer is a *feature for this market*, not a gimmick:
balance/financial-position privacy is a genuine requirement for retail housing
investors and for tenants (you should not broadcast your net worth to vote on
your own building). Aztec gives us **private balances + public auditability of
aggregates** — exactly the "confidential but compliant" posture institutions
ask for. That is the defensible wedge over a plain RWA-on-a-public-L2 competitor.

### 2.3 The growth flywheel

```
            ┌─────────────────────────────────────────────┐
            │  More savers deposit  →  more capital        │
            │       ↑                        ↓             │
   rewards + rent yield            governance buys more    │
   make holding attractive          (better) properties    │
            ↑                              ↓               │
   real NAV + redemption floor   →  rent + appreciation    │
   make FSFT trustworthy             accrue to FSFT NAV     │
            └──────────────← tenants become holders ←──────┘
```

Each plan phase below is chosen to close one broken arrow in this loop.

> *Note (per the canonical model in `CLAUDE.md`): in the loop above, **rent is a
> separate claimable earnings stream, not NAV growth** — only property
> appreciation accrues to NAV. "Make holding attractive" = rewards + withdrawable
> (or reinvestable) rent earnings.*

---

## 3. Phased development plan

Phases are ordered by **"what unblocks trust and therefore deposits"**, not by
ease. Each item lists the concrete contract/frontend touchpoints.

### Phase 1 — Make the backing real (the trust foundation) — *next 1–2 milestones*

> Without this, every token mechanism in §4 is built on sand.

1. **Real yield source to replace the DeFiVault stub.**
   - Short term: integrate a conservative, audited on-chain yield (e.g. a
     tokenized-T-bill / money-market position bridged in as the EUR-side asset)
     so idle deposit capital earns *actual* return while waiting to be deployed
     into property. Keep `DeFiVault`'s interface; swap the implementation.
   - Medium term: **rent ingestion** — an oracle/keeper posts collected rent per
     property; `HousingFund` pools it across all properties and distributes it as
     a **claimable EUR earnings stream, separate from NAV** (per the canonical
     model in `CLAUDE.md` — rent is income, not NAV growth; holders withdraw it as
     fiat or reinvest). *This is the cash flow that justifies "earn the rent."*
   - Code: `contracts/defi_vault/`, new `record_rent(property_id, amount)` on
     `HousingFund`, keeper script under `scripts/`.

2. **Live NAV oracle + on-chain valuation proof.**
   - Wire the existing `proofs/recursive/housing_valuation` circuit into a
     governance-gated valuation update: a quorum of valuers (or a signed
     appraiser feed) posts property marks; the recursive proof attests the
     aggregate without revealing per-property detail.
   - Result: `get_valuation_public()` reflects a *fresh, attested* NAV, so the
     DEX price band and any redemption price are trustworthy.
   - Code: `proofs/recursive/housing_valuation`, `HousingFund` valuation setter,
     `FSFTDex` band anchor.

3. **Redemption floor / exit queue.**
   - Add a protocol redemption path: holders can redeem FSFT for EUR at
     `min(NAV, available_liquidity)` via a **queue** funded by a reserve buffer
     (a configurable % of deposits + accrued yield held back). Hard exits go to
     the DEX; the floor handles the base case so retail isn't trapped.
   - This is the single biggest retail-trust unlock. Document the floor's limits
     honestly (it is best-effort, capped by reserve — never promise instant full
     liquidity).
   - Code: new `redeem_request` / `process_redemptions` on `HousingFund`,
     reserve accounting, frontend `/portfolio` redeem flow.

### Phase 2.0 — The project-finance dossier (the actual near-term wedge) — *build this first*

> This is the feature the outreach docs say Fair Squares will benefit from most.
> It is product-led, partner-validated, and does **not** require the token layer.

0. **Privacy-aware project dossier / "deal room."**
   - One page per affordable-housing project that renders a shared, single source
     of truth for every stakeholder: capital stack (public subsidy, bank debt,
     member/co-op capital, guarantees, Fair Squares capped-return layer),
     documented financing gap (`onrendabele top`), affordability covenant (rent
     band, target group, lock-up years, clawback), milestones, use-of-funds
     reporting, and impact metrics (homes enabled / €1m, rent discount,
     affordability-years).
   - **Privacy-aware by role:** public aggregates (gap closed, % affordable,
     covenant locked) visible to all; sensitive detail (individual member capital,
     eligibility documents) gated to authorized parties via the existing KYC
     credential + Aztec public/private split. Reuses `KYCVerifier` credentials and
     the `proofs/recursive` attestation pattern.
   - **Eligibility proofs where they matter:** e.g. De Walvis key-worker housing —
     prove a tenant qualifies (healthcare worker, income band) without exposing
     documents. This is a concrete, partner-named use of the ZK layer that is
     *not* speculative.
   - Frontend: a new `/projects/[id]` dossier view (the redesign already has a
     Projects tier); most of this is presentation + role-gated reads over data the
     contracts/aggregates can already express. Ship a read-only dossier first;
     wire capital flows later.
   - **Why first:** every Tier-1/Tier-2 partner in
     `netherlands-pilot-partner-targets.md` asked for exactly this, and it carries
     no regulatory/token risk. It is the credible thing to demo on a 25-minute
     call.

### Phase 2 — Bring tenants into the loop (the equity differentiator) — *the moral and marketing core*

4. **Rent-to-equity ("your rent builds your equity").**
   - A tenant in a fund-owned unit gets a KYC credential scoped to that property;
     a configurable share of each rent payment mints FSFT to the tenant (subject
     to the small-depositor-friendly formula).
   - Over a lease, the tenant accrues ownership of the building they live in and
     gains governance voice over it. This is the headline equitable feature and
     the strongest PR/outreach story for the Netherlands partners.
   - Code: tenant credential type in `kyc_verifier`, rent→mint path in
     `HousingFund`, tenant view in frontend.

5. **Property-scoped governance.**
   - Let tenants + holders of a specific property vote on property-specific
     decisions (maintenance, improvements, rent policy within legal bounds),
     separate from fund-wide acquisition votes. Reuse the private-ballot
     machinery; add a `property_id` scope to proposals.
   - Code: `governance` proposal scoping.

### Phase 3 — Token economics that retain capital (the flywheel) — *covered in detail in §4*

6. **FSFT staking + fee capture** (align long-term holders, give the token a
   yield beyond NAV).
7. **Trust-minimized rewards** (replace admin weight-setting with the
   `rewards_weights` recursive proof).
8. **Finish AIP-20 standardization** per `PHASE3_TOKEN_STANDARDIZATION.md`
   (clean interfaces → audits, wallet support, composability).

### Phase 4 — Compliance, scale & ecosystem — *required for institutional euros*

9. **Audit + formal review** of HousingFund/DEX/Rewards before any mainnet value.
10. **Legal wrapper & redemption SPV** aligned with `pilot-term-sheet.md` (the
    on-chain FSFT must map to a real legal claim on the property SPV; this is
    what makes pension-fund capital possible).
11. **Impact-metrics dashboard** (affordable units created, tenants converted to
    owners, average ticket size) — the ESG artifact institutions need.
12. **Multi-jurisdiction KYC** and a partner onboarding kit (the contact-persons
    doc is the seed of a real BD pipeline).

---

## 4. Token & crypto-economic mechanisms (the menu, with recommendations)

The brief explicitly asks to weigh tokenomics/crypto mechanisms. Here is a
curated set, each with *why it fits an equitable housing protocol* and a
recommendation. **Principle: every mechanism must serve affordability and
alignment first — no extractive design.**

### 4.0 Capped-return accounting — the mechanism the docs actually commit to

> **Update (2026-06-01) — refined to the ROR model; this paragraph's
> "surplus → reserve" mechanism is superseded.** The canonical model is now
> defined in [`CLAUDE.md` → "Economic model: rent, return & NAV"](../CLAUDE.md):
> the "cap" is **cost-based rent**, not a payout skim. Rent = **ROR ×
> acquisition_value** (e.g. 3% of a €500K home = €15K/yr = €1,250/mo), paid
> monthly, and the **full** amount flows to the investor pool. The affordability
> benefit reaches the household *directly* via below-market rent, so there is
> **no separate surplus-to-affordability-reserve** route. The 15–25 yr covenant,
> clawbacks, and anti-speculation posture below still hold; only the
> "cap per-investor payout, route the remainder to a reserve note/pool"
> implementation is dropped.

Before any of the crypto-native mechanisms below, the protocol's economic
**default** must match the published `pilot-term-sheet.md`: a **capped return
(~3–4% net)**, a **15–25 year affordability covenant**, **clawbacks** if
affordability is removed, and **excess upside redirected** to an affordability
reserve / tenant benefit / public partner / reinvestment pool rather than to
investors. On-chain this is a capped-distribution rule in `HousingFund` (cap the
per-investor payout; route the remainder to a reserve note/pool) plus
covenant-state tracked in the project dossier (§2.0). This is the *anti-speculation*
core of the brand — implement it before staking/fees, because every other
mechanism must respect the cap.

### 4.1 FSFT value accrual — recommended: **NAV + yield, not inflation (and capped, per §4.0)**

FSFT should be a *real-asset claim*, not a speculative emission. Its value =
(property NAV + accrued rent + reserve) ÷ supply. Keep minting strictly tied to
deposits/rent so supply can never be diluted away from backing. **Do not** turn
FSFT into a high-emission farm token — that would betray the thesis and attract
mercenary capital that flees.

### 4.2 Reward token vs. FSFT — keep them separate (recommended)

Today `ProtocolRewards` emits a *protocol token* distinct from FSFT. Keep this
two-token split:
- **FSFT** = asset-backed ownership (stable, NAV-driven, the thing you hold).
- **Protocol/governance token** = incentive + protocol-wide governance + fee
  rights (the thing that bootstraps participation).
This avoids the classic RWA mistake of inflating the asset token. The protocol
token can later capture protocol fees (4.5) and govern parameters.

### 4.3 Staking with real fee capture — recommended

Let holders stake the protocol token (and/or lock FSFT) to:
- earn a share of **protocol fees** (DEX trading fee, a small management/perf
  fee on yield) — *real revenue, not emissions*;
- boost reward-epoch weight (a `ve`-style time-lock multiplier — longer lock,
  higher weight) to reward long-term aligned capital over flippers.
This converts one-time depositors into recurring participants and gives the
token a cash-flow-backed reason to exist.

### 4.4 Rent-to-equity — recommended (the differentiator, see §3 item 4)

The most defensible, mission-aligned mechanism. It is also a *retention* engine:
tenants who are accruing equity don't churn, and they evangelize.

### 4.5 Protocol fee design — recommended (kept gentle)

- **DEX fee:** tiny bps fee on fills → fee pool (to stakers + reserve).
- **Yield performance fee:** small % of rent/DeFi yield → sustains the protocol
  + funds the redemption reserve.
- **No deposit fee, no exit penalty for small depositors** — equity first.
Fees fund the redemption floor and staker rewards, closing the flywheel with
*organic* revenue instead of token printing.

### 4.6 Redemption floor / liquidity backstop — recommended (see §3 item 3)

A reserve-funded floor is itself a token mechanism: it gives FSFT a credible
soft peg to NAV and is the difference between "interesting demo" and "thing
retail will actually put money in."

### 4.7 Quadratic / capped governance weight — recommended for equity

Acquisition voting currently is one-vote-per-proposal per KYC'd depositor (good,
anti-plutocratic). Preserve this egalitarian default; if vote weight ever scales
with stake, **cap it** (or use quadratic weighting) so a whale can't dominate
which properties get bought. This is on-brand for "fair" squares.

### 4.8 Mechanisms to **avoid** (explicitly)

- High-APR emission farming (mercenary TVL, betrays mission).
- Rebasing / algorithmic-peg gimmicks on FSFT (NAV peg must be asset-real).
- Leveraged/derivative products on FSFT before the base layer is audited.
- Any design that lets large holders crowd small depositors out of distributions
  — the FIFO + small-floor formula is a core equity feature; protect it.

---

## 5. Go-to-market: turning the Netherlands pilot into users

The outreach docs already identify the wedge (Dutch housing crisis), a partner
target list, and named contacts. The product plan above should be sequenced to
make those conversations land:

1. **Lead with the tenant story.** Rent-to-equity (§3.4) is the headline that
   gets press, municipalities, and housing-corporation partners on a call. Build
   a demoable version early even if limited.
2. **Give institutions the audit artifact.** NAV oracle (§3.2) + impact
   dashboard (§4 item 11) + legal wrapper (§4 item 10) are the three things a
   pension fund's investment committee asks for. Prioritize them for the
   institutional track.
3. **Give retail a frictionless on-ramp.** Small-ticket deposits, zkPassport KYC
   already in the frontend, mobile-first flows, and the redemption floor so they
   know they can get out. The €50 "own a brick" hook is the acquisition funnel.
4. **Run a contained pilot** matching `pilot-one-page-thesis.md` /
   `pilot-term-sheet.md`: one building, a real (or shadow) NAV, a cohort of
   tenants offered rent-to-equity, and a small group of impact investors —
   measure conversion, then template it.

---

## 6. Suggested sequencing & "definition of done"

| Order | Item | DoD (trust unlocked) |
|---|---|---|
| 1 | Real yield + rent ingestion (§3.1) | Pooled rent accrues as a **claimable EUR earnings stream (separate from NAV)** from actual cash flow in a test deploy; a holder can withdraw or reinvest it. |
| 2 | NAV oracle + valuation proof (§3.2) | `get_valuation_public()` is fresh & attested; DEX band tracks it. |
| 3 | Redemption floor (§3.3) | A holder can redeem at NAV-capped-by-reserve on testnet. |
| 4 | Rent-to-equity MVP (§3.4) | A tenant credential converts rent → FSFT end-to-end. |
| 5 | Staking + fee capture (§4.3/4.5) | Stakers earn real DEX/yield fees; ve-lock boosts weight. |
| 6 | Trust-minimized rewards (§3.7) | `rewards_weights` proof replaces admin weight-setting. |
| 7 | AIP-20 finish + audit (§3.8/§4 item 9) | Clean standard interfaces; external audit booked. |
| 8 | Legal wrapper + impact dashboard (§4 items 10–11) | FSFT maps to a legal SPV claim; impact metrics live. |
| 0 | **Project-finance dossier (§2.0)** | One real project's gap, capital stack & covenant render for all parties; role-gated detail. *Build before the token layer.* |

**Equity gate (from §0.6.1) — apply to every item above.** A feature ships only
if it: **(a) does not inflate land/house prices** (it is capped & covenant-bound,
not a new credit channel — esp. items 0, 5, 8); **(b) improves or measures
distributional equity** (who got the affordability — esp. the small-floor,
rent-to-equity, and impact-dashboard items 4, 8); and **(c) is rate-resilient**
(backed by real cash flow + reserve, not simulated yield — esp. items 1, 3).
Items that fail a gate get redesigned, not shipped.

---

## 7. Risks & honest caveats

- **Yield realism.** If the only yield is still simulated at pilot time, say so
  to partners — never present simulated APY as real. The plan's #1 priority is
  exactly to fix this.
- **Liquidity is hard.** The redemption floor is *best-effort*, bounded by
  reserve. Communicate limits; don't promise instant full exit.
- **Regulatory.** FSFT is very likely a security in most jurisdictions; the
  legal wrapper (§4 item 10) is a gating dependency for real money, not an
  afterthought. Sequence compliance with engineering, not after it.
- **Oracle trust.** A NAV oracle is a centralization/manipulation surface;
  prefer multi-party attestation + the recursive proof over a single feed.
- **Don't over-tokenize.** The temptation to juice growth with emissions is the
  fastest way to lose the mission and the long-term holders. Resist it.

---

## 8. Immediate next actions (small, concrete)

1. Replace `DeFiVault`'s simulated `accrue_yield` with a pluggable yield-source
   interface + add `record_rent` to `HousingFund` (Phase 1.1).
2. Spec the NAV oracle update path and connect the existing
   `proofs/recursive/housing_valuation` circuit (Phase 1.2).
3. Spec the redemption-floor reserve accounting and queue (Phase 1.3).
4. Draft the rent-to-equity tenant-credential design note (Phase 2.4).
5. Finish the AIP-20 migration tracked in `PHASE3_TOKEN_STANDARDIZATION.md`.

Each becomes its own design note under `docs/` and its own branch, tested with
`./scripts/aztec-test.sh` per `CLAUDE.md`.

---

*This plan is intentionally opinionated about what NOT to build (extractive
tokenomics) as much as what to build. The protocol's moat is being genuinely
equitable and genuinely private — every roadmap decision should be checked
against "does this help the small saver and the tenant, or only the whale?"*

---

## 9. The demo plan — what to build *next* and *show*, realistically

This is the operational answer to "what is the plan from here?" The goal is a
**believable, end-to-end demo** that makes a partner (a Rotterdam housing
corporation, a wooncoöperatie, an impact investor) say *"I understand what this
does and I'd pilot it"* — without ever presenting simulated numbers as real.

### 9.0 Demo principles (read first)

1. **Demo what's true; label what's modelled.** Everything already verified in
   `PHASE3_TOKEN_STANDARDIZATION.md` (deposit → governance vote → execute →
   FIFO+floor distribution → claim, all on a local Aztec network) is *real* and
   is the spine of the demo. Anything not yet real (rent income, NAV oracle,
   redemption) is shown behind a visible **"Modelled for demo"** chip — never as
   live APY. This honesty is itself a selling point to this audience.
2. **One concrete project, not an abstract fund.** Pick a single, real-feeling
   project (e.g. a Rotterdam transformation of ~20 affordable units with a
   documented `onrendabele top`). Every screen tells *that* project's story. This
   is the §2.0 dossier made tangible.
3. **Lead housing, not crypto.** The first screen a partner sees is the project
   dossier and "homes enabled / gap closed", not a token balance or a DEX.
4. **Scope to a laptop.** The whole thing must run via
   `docker compose --profile aztec up` (local network) — no testnet dependency,
   no real money, deterministic seed data.

### 9.1 What already works (the demo spine — build nothing, just script it)

Verified-live today (local network): `/invest` deposit (private, KYC-gated,
FIFO+floor), `/governance` create→vote (private ballot)→finalize→execute,
HousingFund `open_distribution`→`/portfolio` claim, `/fund` + `/portfolio`
live reads (NAV-per-FSFT), `/kyc` (zkPassport flow + dev skip), `/rewards`
claim, `/dex` place/cancel/match. API routes for all of the above exist
(`api/fund/*`, `api/governance/*`, `api/portfolio`, `api/rewards/*`, `api/dex/*`,
`api/kyc/*`). **The headline flow — KYC → deposit → vote → execute → claim your
fair (small-floor-weighted) share — is the demo, and it is real.**

### 9.2 The four demo-grade features to build next (small, high-impact, touch the problem)

These are deliberately the *thin, demoable slices* of §2.0–§3, chosen because
each directly dramatizes the affordability problem and is achievable without the
heavy legal/audit lift:

- **D1 — Project dossier page (`/projects/[id]`).** *(§2.0)* The single most
  important new screen. Renders the chosen project's capital stack (senior bank
  debt · public subsidy · member capital · **Fair Squares capped-return gap
  layer**), the documented financing gap, the affordability covenant (rent band,
  target group, 15–25 yr lock, clawback), milestones, and the **"homes enabled /
  gap closed"** KPIs. Public aggregates for everyone; sensitive rows role-gated.
  *Mostly presentation over data the contracts + a small project-metadata JSON
  can express.* This is what a partner actually wants to see on the call.
- **D2 — Capped-return + covenant accounting (visible).** *(§4.0, refined to the
  ROR model — see `CLAUDE.md`)* Show the **capped return as cost-based rent**:
  rent = ROR × acquisition value (e.g. ~3% of acquisition), paid monthly, **fully
  to the investor pool**, with the affordability coming from the rent being
  *below market* (no surplus-to-reserve skim). *Showing* "investor return is the
  ROR (~3%); rent is cost-based so the household is protected" is the core
  anti-speculation story and differentiator. Tag clearly as modelled where ROR /
  acquisition value are not yet on-chain.
- **D3 — Rent-to-equity teaser (tenant scenario).** *(§3.4)* A minimal tenant
  flow: a tenant credential scoped to the project, and a "rent payment → mints a
  small FSFT slice to the tenant" action (modelled rent for the demo). Even a
  single end-to-end tenant→equity transaction is the strongest emotional beat:
  *"your rent finally builds your equity, privately."* Don't over-build; one
  convincing path beats a half-built system.
- **D4 — Impact + trust strip.** *(§4 item 11 + existing ProofRail/TrustChip)*
  A compact, always-visible summary: homes enabled, affordability-years locked,
  % allocated to small depositors, and the privacy/KYC proof state. Reuses the
  existing `shell/TrustChip` + `ui/ProofRail`. Proves the equity + privacy claims
  at a glance.

> **Cut line for the demo:** real DeFi yield, live NAV oracle, redemption queue,
> staking/fees, audit, legal wrapper — all explicitly **out of demo scope** (they
> are real-money/production concerns from §3–§4). The demo *names* them on a
> "what's next for production" slide; it does not fake them.

### 9.3 User scenarios to script (the demo walkthrough)

Three personas, one project, ~8–10 minutes total. Pre-seed the local network so
each starts instantly.

1. **Sofie — small saver / would-be first-time buyer.** Connects wallet →
   passes KYC (zkPassport dev path) → deposits **€200** into the project on
   `/invest`. The demo shows her deposit is **private** (only she sees the
   amount) but the fund total updates publicly. *Beat:* "€200 buys real
   affordable-housing exposure, and the small-depositor floor means she's
   *over*-allocated vs. a whale — equity by design."
2. **Pieter — impact investor.** Opens the **project dossier (D1)**: sees the gap,
   the capital stack, the **capped 3–4% return (D2)**, the 20-year affordability
   covenant, and "this closes a documented `onrendabele top` for 20 homes."
   Deposits a larger ticket; creates/▶votes a governance proposal to deploy
   capital into the project. *Beat:* "auditable, capped, covenant-locked,
   privacy-preserving — the ESG paper-trail his committee needs."
3. **Governance + claim (the real spine).** Quorum reached → **execute** →
   `open_distribution` → both Sofie and Pieter **claim** their FIFO+small-floor
   shares on `/portfolio`; the numbers reconcile exactly (the verified
   887/112-style split). *Beat:* "fair, deterministic, on-chain distribution —
   no admin discretion."
4. **Lana — tenant (rent-to-equity, D3).** A rent payment converts to a small
   FSFT slice in her private balance; the **impact strip (D4)** ticks up "tenant
   equity" and "homes enabled". *Beat:* the moral core — the person living there
   becomes a part-owner, privately.

### 9.4 Build order for the demo (2–3 focused iterations)

| Step | Work | Done when |
|---|---|---|
| 1 | **Seed a believable project + cohort.** Extend `scripts/seed-*`/bootstrap to plant one project (metadata + a proposal sized *below* total deposits so "ready to deploy" is non-zero — closes the open `docs/TODO.md` demo-headroom item) and 3–4 pre-funded personas. | `docker compose --profile aztec up` yields a demo-ready state with no manual clicks. |
| 2 | **D1 project dossier page.** | `/projects/[id]` renders the chosen project's gap, capital stack, covenant, milestones, KPIs from live reads + project JSON; sensitive rows role-gated. |
| 3 | **D2 capped-return (ROR) display** on the distribution/claim + dossier. | Claim screens show the ROR-based capped return (rent = ROR × acquisition, cost-based, fully to investors — no reserve skim), labelled real vs modelled. |
| 4 | **D4 impact + trust strip.** | Homes enabled / affordability-years / small-depositor % / proof-state visible app-wide via TrustChip+ProofRail. |
| 5 | **D3 rent-to-equity teaser.** | One tenant credential → one rent→FSFT mint → private tenant balance, end-to-end. |
| 6 | **Demo script + "Modelled for demo" chips + mobile pass.** | A written 8–10 min runbook; every modelled number is chip-labelled; the redesigned pages survive a phone viewport (the open `docs/TODO.md` mobile audit). |

### 9.5 Demo definition of done

- Runs end-to-end on a laptop from one command; no testnet, no real funds.
- A non-crypto partner can narrate "what is being funded, what gap is closed,
  what affordability is protected, what I own, what was privately verified" from
  the screens alone (the §`frontend-redesign` 30-second test).
- Every number on screen is either **verifiably real** (deposit/vote/claim/NAV
  reads) or **chip-labelled "Modelled for demo"** (rent, reserve surplus). No
  exceptions — this credibility *is* the pitch for this audience.
- Passes the §0.6.1 equity gate: the demo visibly (a) caps returns / protects
  against speculation, (b) shows distribution to small savers + a tenant, and
  (c) is honest that durable yield/redemption are production work, not faked.
