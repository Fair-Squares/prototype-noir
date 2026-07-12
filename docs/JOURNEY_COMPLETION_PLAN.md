# Journey completion plan

*Written 2026-07-12. Owner decisions recorded here: (1) the tenant flow is dropped —
from the website (Fair-Squares/website-v2#16) and from this repo's roadmap, superseding
the tenant items in `FUTURE_DEVELOPMENT_PLAN.md` (§3 Phase 2, §4.4 rent-to-equity);
(2) the prototype should implement the journey as promised on fair-squares.nl and make
it much easier to walk; (3) the app's overview should be a genuine portfolio view;
(4) "rents ≥20% below market" is a baseline requirement — the covenant is its
enforcement instrument and the market-rent link should be made explicit.*

Companion docs: `WEBSITE_ALIGNMENT.md` (the gap scorecard this plan closes),
`JOURNEY_FRONTEND_PLAN.md` (the frontend half: routes, components, API surface per
workstream), `DEMO_RUNBOOK.md` (each phase below ends demo-scriptable).

---

## 0. The target journey (post-tenant-flow)

The website journey, minus step 5, is the product spec:

1. **Housing fund** — deposit / withdraw ✅ built
2. **Asset onboarding** — owners submit vetted properties ✗ build (J1)
3. **Assessment & governance** — council review ✗ build (J2) + investor vote ✅ built
4. **Bidding & ownership** — fund↔property matching ◐ build the matching (J4);
   fractional ownership = FSFT/NAV, already built
5. ~~Tenant matching~~ — dropped 2026-07-12

Plus two cross-cutting owner requirements: an effortless guided journey (J5) and a
portfolio-grade overview (J6). The 20% baseline (J3) rides on J1's dossier.

---

## J1 — Asset onboarding (journey step 2)

**Goal:** a property owner submits a home with its documentation; nothing reaches a vote
unvetted. Smallest honest version of the website's "appraiser reports and technical
assessments".

**Contract** (extend `governance` — assessment already lives there; avoid a new crate):

- New listing stage ahead of proposals: `submit_listing(property_id, ask_eur,
  market_rent_ref_eur, dossier_hash)` where `dossier_hash` is a Poseidon2 hash of the
  off-chain document bundle (appraiser report, technical assessment). Store per-listing:
  proposer, ask, market rent reference, dossier hash, status
  (SUBMITTED → COUNCIL_APPROVED → PROPOSED; make SUBMITTED nonzero — see the
  status-collision finding in the 2026-07-12 review).
- `create_proposal` gains a `listing_id` and requires `COUNCIL_APPROVED`; proposal
  inherits property_id/ask from the listing so they can't drift.
- Owner gating: reuse `kyc_verifier` — a `PROPERTY_OWNER` role bit alongside
  `is_investor` (same registration path, no new contract).

**Frontend:** a submit-property wizard under `/fund` (owner-facing): form → upload docs
(hash client-side, store file in the demo backend) → sign submission. Listing cards show
dossier status + document hashes for auditability.

**Definition of done:** a scripted demo where an owner account submits a listing with two
documents and it appears as "awaiting council review"; `aztec test` covers
listing-status transitions and the create-proposal gate.

## J2 — Housing council review (journey step 3a)

**Goal:** the two-stage assessment the website promises: experts first, community second.

**Contract:**

- `kyc_verifier`: add a `COUNCIL` role (issued by admin, revocable — same machinery as
  verifiers).
- `governance`: `council_approve(listing_id, quality_score)` / `council_reject
  (listing_id)`, callable by council members only; configurable
  `min_council_approvals` (constructor arg, default 1 for the demo, mirroring
  `min_quorum_votes`). `quality_score` (e.g. 0–100, council's price-quality judgment)
  is stored for J4's matching.
- Approval flips the listing to `COUNCIL_APPROVED`, opening `create_proposal`.

**Frontend:** a council queue view (listing + dossier hashes + score input). Badge the
council role in the wallet switcher like the investor badge.

**Definition of done:** end-to-end demo — submit → council approves with a score →
proposal opens for the investor vote; negative tests: non-council can't approve, double
approval, vote before approval.

## J3 — The 20% baseline, made explicit (owner decision: baseline, not aspiration)

**What already exists (don't rebuild):** the W1 covenant (`rent_ceiling_bps`,
`lock_years`, voted with the proposal, immutable once attached) and on-chain enforcement
in `record_rent` (`monthly rent ≤ acq × ceiling_bps / 10000 / 12`). Rent is capped by
construction — the instrument is built.

**The missing link:** the ceiling is relative to *acquisition value*; the website's claim
is relative to *market rent*. Connect them:

- J1's listing carries `market_rent_ref_eur` (appraiser-attested, part of the dossier).
- `governance.set_proposal_covenant`: assert the covenant honors the baseline —
  `ceiling_monthly ≤ market_rent_ref × (10000 − baseline_bps) / 10000` with
  `baseline_bps` a protocol constant (2000 = the 20% floor; a covenant may promise
  *more* discount, never less). One assert, u64 bps math per house rules.
- Surface it everywhere: property cards and portfolio rows show
  "market €X → capped at €Y (−Z%)"; `/learn` gets the baseline stat next to the real
  ROR; `/api/fund/stats` exposes `baselineBps`.

**Definition of done:** attaching a covenant above the baseline reverts (test), and the
demo shows a property card with the market-vs-capped rent comparison. After this lands,
`WEBSITE_ALIGNMENT.md` row 2 flips to ✅.

## J4 — Matching fund to properties (journey step 4, "bidding & ownership")

**Goal:** the website's "smart bidding algorithm matches housing-fund resources with
approved properties" — implemented honestly as deterministic priority matching, not an
auction (nothing to bid against in a single-fund model; reframe, don't fake).

**Contract** (`housing_fund` + `governance`):

- Passed proposals enter a funding queue instead of executing ad hoc. Priority =
  affordability-per-euro: rank by council `quality_score`, tie-break by covenant
  discount depth, then FIFO.
- `match_next()` (permissionless, like `execute_proposal`): funds the highest-priority
  queued proposal iff liquid capital ≥ ask (liquid = deposits − parked − reserved);
  reserves the ask, records the acquisition, triggers the existing distribution
  lifecycle. Partial funding stays out of scope — one home, one ask, keep it simple.
- Ownership side is already built: FSFT/NAV *is* the fractional-ownership layer.
  Document the mapping in `/explain`, and give J6 a per-property exposure view
  (your FSFT share × property weight in NAV) so "ownership" is visible per home.

**Definition of done:** two approved properties, one funding pass — the higher-scored
one funds first; queue view in the frontend shows rank + why ("score 82, −24% rent").

## J5 — Make the journey much easier (owner requirement)

**Goal:** walking steps 1→4 should take minutes, not a runbook.

- **A `/journey` stepper as the app's home**: Verify → Deposit → Properties (browse or
  submit) → Vote → Track. Each step reads the current account's real state (KYC role,
  balance, open votes, claimables), shows done/next/blocked, and deep-links the one
  action that advances it. The journey page *is* the navigation; existing pages become
  its destinations.
- **Kill the dead ends:** every empty state gets a CTA ("no properties yet — submit one
  or switch to the demo owner"); errors surface the real reason (the API-layer
  revert-outcome fix from the 2026-07-12 review, §3.1 item 5, is a hard prerequisite —
  false "success" answers make a guided journey lie).
- **One-click demo actors:** the account switcher pre-wires owner / council / investor
  personas so the full journey is walkable solo.
- **Explain inline:** reuse `/explain` content as step-level "what's happening
  on-chain?" popovers instead of a separate page visit.

**Definition of done:** a first-time user (or the demo script) completes
verify→deposit→submit→approve→vote→fund in one sitting without touching the runbook.

## J6 — Portfolio-grade overview (owner requirement)

**Goal:** the app's overview answers "what do I own, what is it worth, what can I do?"
at a glance.

- **Portfolio page** (extend `/portfolio` + `/api/portfolio`): deposits (public +
  private, with the record breakdown that H2 withdrawals already expose), FSFT balance ×
  NAV/FSFT = market value, claimable rent + distributions + rewards (with claim CTAs),
  per-property exposure (J4), open DEX orders + claimable settlement balances, votes
  cast and pending, activity history.
- **Fund overview**: NAV + NAV/FSFT trend (record snapshots at each `record_asset_sale`
  /rent epoch — groundwork for the NAV-freshness item in `WEBSITE_ALIGNMENT.md` §3.3),
  property table with covenant status (ceiling, −Z% vs market, lock expiry), funding
  queue, distribution + rent-epoch history.
- **Data honesty rules apply:** no fallback-to-zero rendering; loading and error states
  are explicit (CLAUDE.md error rules); every figure traceable to a contract read —
  keep the `/learn` `ModelledChip` convention for anything simulated.

**Definition of done:** one screen answers holdings, value, income, and pending actions
for each demo persona; numbers reconcile with contract state in the demo script.

## J7 — Website parity (fair-squares.nl must match the journey as it lands)

**Goal:** the site and the app tell one story at every point in the build-out — the
website never describes a journey the prototype can't walk, and never omits one it can.
Website work happens in `Fair-Squares/website-v2`; content rules there apply (sentence
case, canonical 20% / ~3% claims, update `public/llms.txt` with every page change).

Per-phase website deliverables:

- **Now (with issue website-v2#16):** remove the tenant step and renumber the journey to
  four steps; update the flowchart asset (drop the tenant/housing-corporation lane) and
  the llms.txt journey line. The prototype's `/journey` stepper (J5) mirrors the same
  four steps — one structure on both surfaces.
- **With J1 + J2 (onboarding + council):** steps 2 and 3 of the site's journey become
  *true* rather than aspirational — verify the copy against what shipped (appraiser
  report + technical assessment hashes; council review then investor vote) and link
  "try it" CTAs to the corresponding journey step in the app.
- **With J3 (baseline):** the site's "at least 20% below market" gains an on-chain
  referent — add "enforced on-chain per property" phrasing where the claim appears
  (home hero/steps, whitepaper "fair rental contracts"), and give the impact calculator
  its provenance caption (real covenant mechanism vs illustrative model).
- **With J4 (matching):** reword journey step 4 — "smart bidding algorithm" → priority
  matching that funds the best affordability-per-euro property first; describe ownership
  as diversified fund shares (FSFT at NAV) with per-property exposure, replacing the
  per-property fractional-tokens framing (also whitepaper step 3).
- **Standing copy fixes (independent of phases,** `WEBSITE_ALIGNMENT.md` **§4):** privacy
  story (Aztec), retire the app-chain framing, fix the "90% of tokens" claim, one-vote-
  per-investor wording, exit/DEX mention, GitHub link to the active repo, "public
  testnet" CTA softened until W3b.
- **Redraw the flowchart once, after J4** — a second update when the journey is complete
  (fund → onboard → council + vote → match → returns), rather than per-phase asset churn.

**Definition of done per phase:** the how-it-works journey, whitepaper protocol steps,
and llms.txt describe exactly what the app can demo that day — no step ahead of the
code, none behind it.

---

## Sequencing

| Phase | Prototype | Website (J7) | Why this order |
|---|---|---|---|
| 0 | Review fixes: §3.1 of `WEBSITE_ALIGNMENT.md` (withdraw lockout, truncations, DEX TTL/band, stale-note voting, API revert handling) | Tenant-step removal + renumber (#16); standing copy fixes (§4) | They falsify already-shipped claims; J5/J6 build on trustworthy state and APIs. |
| 1 | J1 + J2 (onboarding + council) | Verify steps 2–3 copy against what shipped; CTA deep-links | Unblocks the journey's missing middle; pure extension of existing governance/kyc machinery. |
| 2 | J3 (baseline link) | "Enforced on-chain" phrasing + calculator provenance | One assert + UI surface once J1's market ref exists; flips the website's headline claim to "demonstrated". |
| 3 | J4 (matching queue) | Step-4 reword (matching, fund shares); flowchart redraw | Needs J2's scores; completes step 4 as promised. |
| 4 | J5 + J6 (journey UX + portfolio) | Final llms.txt journey pass — site and app stepper identical | Frontend-heavy, parallelizable; lands last so it reflects the full flow. |

Verification per phase: `aztec compile` + `aztec test` (each contract change ships with
the negative-path tests the 2026-07-12 review flagged as missing), `tsc --noEmit`,
`npm run build`, then a scripted walkthrough appended to `DEMO_RUNBOOK.md`.

Out of scope (unchanged from `FUTURE_DEVELOPMENT_PLAN.md` unless re-decided): tenant
rent-to-equity (dropped), real DeFi yield, NAV oracle beyond snapshots, redemption
floor, testnet deploy hardening (W3b — queued separately).
