# Final UX/UI simplification overhaul — plan

*Written 2026-07-15, revised the same day after the owner's impact clarification.
Plan only — no implementation in this PR.*

**Owner's brief:** simplify the app one more time. The use-case must be understandable
in modern-day language with a bit of financial jargon (tradfi or crypto). The UI/UX must
make sense for the average-day user — don't dumb it down, but make it usable.

**Owner's clarification (2026-07-15):** as much as this is a financial application, it
has real-world implications — it means someone gets housing, financed by a group of
investors, big or small, who share one goal: making that possible. The information the
app shows must keep that visible and bring it into the light. So this plan pairs the
finance register with the human outcome everywhere (§3, §4): impact is information, not
decoration, and it obeys the honesty rule like every other number.

**Companion docs:** [`frontend-redesign-design-doc.md`](./frontend-redesign-design-doc.md)
(the previous overhaul — its design system and IA survive this plan),
[`JOURNEY_COMPLETION_PLAN.md`](./JOURNEY_COMPLETION_PLAN.md) (J5 "make the journey much
easier" and J6 "portfolio-grade overview" are absorbed here on the frontend side),
[`WEBSITE_ALIGNMENT.md`](./WEBSITE_ALIGNMENT.md) (the privacy story as differentiator),
CLAUDE.md §"User-facing product rules" (the binding rules this plan extends).

---

## 0. What this overhaul is (and is not)

**Is:**

1. A **language shift**: from the current civic/plain register to a *modern retail-finance
   register* — the vocabulary someone knows from a neobank or broker app (Revolut, Trade
   Republic, DEGIRO), plus a deliberate, small dose of tradfi/crypto jargon where it adds
   precision and credibility (NAV, covenant, secondary market, private balance).
2. An **IA compression**: 13 user-facing routes with overlapping jobs → ~10 with exactly
   one job each; claim actions centralized in one place; the two education surfaces
   de-duplicated.
3. A **per-screen simplification** against the audited hotspot list (§4): fewer visible
   numbers, one primary CTA, protocol lifecycle operations out of the ordinary user's path.
4. **Usability-debt closure**: the outstanding mobile audit (TODO.md), the dead-end
   transaction history, the Button/Link duplication, debug UI leaking into the default flow.
5. An **impact re-centering**: every money surface also answers "who gets housed, at what
   rent, for how long" — the investors' shared goal stays visible next to their money
   (§3). Impact figures are sourced and labeled like every other number (honesty rule).

**Is not:**

- A re-skin. The brand system (Nexa/DM Sans, teal/magenta/anthracite, `.surface`/`.btn-*`
  /`.chip-*` tokens, illustrations) stays exactly as-is.
- A dumbing-down. Precise terms stay — each gets a one-line plain-language definition
  (InfoDot) and a stable `/explain` anchor. We remove *protocol-internal* vocabulary, not
  *financial* vocabulary.
- A backend change. Frontend + copy only — with D5 resolved to the session-local
  activity log (§4.4, §9), there are no exceptions left.
- A relaxation of the honesty rule. `ModelledChip`, "Demo network · no real funds",
  honest privacy labels, and the no-APY rule all survive verbatim.

**Persona for every decision in this plan:** a Dutch/EU retail user who has a neobank
and maybe a broker account, has never used a crypto dapp, and gives us 60 seconds.
"Average-day user" = them, not a protocol engineer and not a first-time computer user.
They invest for the mission *and* a modest, predictable return — the app must serve
both motivations at once, never one at the expense of the other.

---

## 1. The language system: three vocabulary tiers

The current copy has been through one de-jargoning pass but is inconsistent: it avoids
"yield" yet shows "Current epoch 4 / 120"; it says "Fund Shares (FSFT)" yet a tooltip
cites the `record_rent` contract entrypoint. The fix is a **tiered lexicon** with an
enforced boundary instead of case-by-case judgement:

**Tier 1 — free use, no explanation needed** (the neobank register):
invest, shares, share price, portfolio, position, returns, income, payout, order,
market, fees, verification, KYC, balance, deposit, withdraw, claim.
Equally Tier 1 — the **human-outcome vocabulary**, used in headlines, not footnotes:
homes, households, affordable rent, rent below market, homes enabled, affordability
years, financing gap. A screen that speaks only the first list has failed the owner's
clarification even if every term is plain.

**Tier 2 — the deliberate "bit of financial jargon"** — use freely in headings and labels,
always with an InfoDot one-liner on first appearance per screen, each with a stable
`/explain` anchor. These carry the tradfi/crypto credibility the owner asked for:

| Term | Register | One-line definition (InfoDot) |
|---|---|---|
| NAV / share price (NAV) | tradfi | "Net asset value — the fund's assets divided by shares outstanding. Your share price." |
| Capped return | tradfi | "Returns are capped at ~3% by design, so rents stay below market. This is the deal." |
| Affordability covenant | tradfi (bond covenant) | "A binding rent ceiling voted with each project and enforced on-chain." |
| Secondary market | tradfi | "Sell shares to other verified investors without waiting for the fund." |
| Order book / bid & ask | tradfi | "Open buy and sell orders from other investors." |
| Private balance | crypto | "Held under your keys; amounts visible only to you." |
| Zero-knowledge verified *(per D4: `/explain` glossary + TrustChip expansion only — not pushed as badges)* | crypto | "Proven correct on-chain without revealing your data." |
| Liquidity | tradfi | "How quickly you can turn shares back into euros." |

**Tier 3 — banned from primary UI.** Allowed only inside `/reference` and
`AdvancedDetails` blocks that are explicitly technical (Proofs, on-chain tables):
epoch, bps, attestation/attest, nullifier, shield/unshield, escrow, AIP-20/AIP-721,
tranche (as a bare label), slot, block height, automine/anvil, contract function names,
struct field names (descHash, status code), FSFT/FSP as *bare* tickers with no
first-mention expansion.

**Enforcement (this is what makes the pass "final"):** a Vitest guard in the style of the
existing `proposalLifecycle.test.ts` canonical-vocabulary test —
`frontend/src/lib/__tests__/lexicon.test.ts` greps user-facing sources
(`src/app/**`, `src/components/**`, excluding `components/reference/**`,
`ProjectDetailProofs.tsx`, and `app/reference/**`) for the Tier-3 banned strings and
fails on any hit. Copy regressions then break CI the same way lifecycle-vocabulary
regressions already do.

### 1.1 Canonical term map (current → new)

Single source of truth for labels: a new `frontend/src/lib/lexicon.ts` exporting the
canonical strings (and the banned list for the test). Pages import labels instead of
retyping them.

| Current (where) | New | Notes |
|---|---|---|
| "Fund Shares (FSFT)" / bare "FSFT" | **"Shares"**, ticker-style where a symbol helps: "FSFT · €1.28" | Brokerage pattern: ticker next to price, not in prose. First mention per screen: "shares (FSFT)". |
| "Net asset value per FSFT" / "NAV per share €0.xxxx / Set at distribution" (`invest/page.tsx:269-272`) | **"Share price (NAV) — €1.28"**; sub-line "set when the fund records a sale" | One price concept, tradfi term kept. |
| "Rent earnings" (`/portfolio`) | **"Rental income"** — "paid from rent across all homes, pro rata" | Income ≠ share value stays sacred (CLAUDE.md economic model). |
| "FSP participation rewards" | **"Rewards (FSP)"** | Credit-card-rewards mental model; "not yield" framing kept. |
| "Current epoch 4 / 120" (`rewards/page.tsx:173`) | **"Reward month 4 of 120"** | Epochs are monthly; say so. |
| "Governance" (nav, headings) | **"Votes"** | Proposal noun stays "funding request" (already good). |
| "Trade" / "DEX" (nav, `/dex`) | **"Secondary market"** | Route can stay `/dex`; label changes. |
| "shield €X into your private balance" (`dex/page.tsx:219`) | **"move €X to your private balance"** | Same action, no crypto-internal verb. |
| "unfilled escrow moved to your claimable balance" (`dex/page.tsx:161`) | **"your unfilled amount is reserved — collect it below"** | |
| "Run private Fund Shares check" (`governance/page.tsx:238`, `RewardsPanel.tsx:59`) | **"Confirm eligibility (private)"** — "a one-time private check that you hold shares; your balance is never revealed" | |
| "Distribution" (tabs, buttons) | **"Payout"** | Lifecycle chips: "Funded → Paying out → Fully paid" (see §5.3). |
| "Finalise — approve request" / "Execute & open distribution" (`OverviewTab.tsx:153-188`) | **"Record result"** / **"Deploy capital & open payout"** — and role-gated (§4.6) | |
| "Deed NFT #4 (AIP-721) is held by the fund" (`fund/[id]/page.tsx:205`) | **"Property deed #4 is held by the fund"** + AdvancedDetails for the token standard | |
| "Settlement currency (AIP-20)" (`reference/page.tsx:59`) | stays — Reference is a sanctioned Tier-3 surface | |
| "…rent the fund has collected on-chain (record_rent)…" (`HoldingsBreakdown.tsx:86`) | drop the function name | Function names never appear outside Reference. |
| "onrendabele top" leading the Dossier copy (`ProjectDetailDossier.tsx:96,141`) | lead with **"the financing gap"**; keep "(Dutch: *onrendabele top*)" once, in the InfoDot | The Dutch term is real sector jargon — keep it as flavor, not as the primary label. |
| "±{priceBandBps/100}%" and "{priceBandBps} bps" (`page.tsx:330`, `reference/page.tsx:165`) | **percentages everywhere** outside Reference | |
| "Capped ~3% net / year" | **"3% target annual return — capped by design"**, never per CLAUDE.md presented as APY/market yield | Wording pre-agreed honest: it's a formula (ROR), not a market rate. See D6. |

### 1.2 Voice adjustments

The bundle voice (sentence case, warm, "we/you", no hype) stays. Two register shifts:

- **Money sentences get shorter and more confident** — current: "Generating the private
  proof and sending two on-chain transactions — an EUR transfer and your private deposit"
  (`invest/page.tsx:435`). New: **"Processing your private deposit…"** with the
  two-transaction detail inside `AdvancedDetails`.
- **Privacy stays quiet assurance** (owner decision D4, 2026-07-15 — the doc originally
  proposed crypto-native badges; the owner chose minimal): the existing model — TrustChip,
  `/explain#privacy`, the honest inline labels ("your ballot stays private", "receive a
  private position") — is the whole privacy surface. No new badges on Invest/Portfolio;
  "zero-knowledge" vocabulary lives in the glossary and TrustChip expansion only.
- **Every headline pairs money with outcome.** The finance clause says what your money
  does for you; the outcome clause says what it does in the world. Pattern: "Earn a
  capped 3% from rent — so families pay below-market rent." Applied to the Home hero,
  the Invest ticket, the Portfolio headline, and vote cards (§4) — woven into the money
  sentences themselves, never split off as mission prose the user must go find.

---

## 2. IA compression

Primary nav stays **Home · Projects · Portfolio** (+ bottom nav on mobile). Changes are
all in the "More" tier and in route jobs:

| Route | Today | After |
|---|---|---|
| `/rewards` | Read-only page whose CTA sends you to `/portfolio` to actually claim | **Folded into `/portfolio`** (Rewards panel already exists there). Route 301s to `/portfolio#rewards`; program explanation moves to `/explain#rewards`. Nav item removed. |
| `/learn` + `/explain` | Two overlapping education surfaces ("About" + "How it works") | **Re-scoped, duplication removed**: `/learn` = why (mission, impact calculator, story); `/explain` = how (mechanics + the canonical glossary with stable anchors, now including every Tier-2 term). The how-it-works section renders in exactly one of them (`/explain`); `/learn` links to it. (Full merge considered — rejected because `/explain#…` anchors are deep-linked from every gate and InfoDot; see D1.) |
| `/dex` | "Trade" | Label **"Secondary market"**, stays under More. Page overhaul in §4.5. |
| `/governance` | "Governance" | Label **"Votes"**, stays under More. Keeper actions role-gated (§4.6). |
| `/kyc` | "Verification" | Stays; checklist copy rewritten to outcomes ("You can invest", "You can vote") rather than capabilities. |
| `/invest` | Contextual (not a tab) — correct | Stays contextual; page overhaul in §4.3. |
| `/reference` | Advanced/debug surface | Stays — and **receives** the protocol parameters evicted from Home (§4.1). |

Net: More menu shrinks 8 → 6 account+reference items; every claim/collect action lives in
exactly one place (Portfolio), every education paragraph in exactly one place.

---

## 3. One canonical model on every screen: your money, and what it makes possible

The average user must meet the same four-line mental model everywhere, in this order:

1. **What you own** — N shares (FSFT) × share price (NAV) = position value.
2. **What it pays you** — rental income (claimable €) + rewards (FSP).
3. **What it makes possible** — the real-world output your money is part of: homes
   enabled, households paying below-market rent, affordability years locked in by
   covenant. This is the one goal the group of investors — big or small — shares, and
   it renders *next to* the money figures on every surface, never on a separate
   mission page.
4. **How you exit** — withdraw (fund) or sell (secondary market).

Every screen that shows money must map its figures onto this model, with income never
folded into share value (existing rule, kept). This becomes a stated rule in CLAUDE.md's
product-rules section when the overhaul lands.

**Impact obeys the honesty rule.** Line 3 is data, not decoration, so it is sourced like
every other number: homes/deeds held and covenant terms come from chain and render
untagged; pro-rata attribution ("your stake financed ~0.3 homes") is arithmetic on real
data but the attribution itself is a model — it carries `ModelledChip`. The "% below
market" figure is a baseline claim whose market-rent reference is not yet on-chain
(WEBSITE_ALIGNMENT §3.2 / JOURNEY_COMPLETION_PLAN J3): until J3 lands it renders
modelled; when J3 lands it flips to untagged. The copy is written once — the chip does
the honesty work.

---

## 4. Screen-by-screen plan

Addresses each audited hotspot. Per screen: the job, what changes, what moves where.

### 4.1 Home (`app/page.tsx`)

*Job: disconnected → understand the product in 60 s; connected → position + one next step.*

- Disconnected hero keeps the mission line but adds the **finance-plus-outcome one-liner**
  right under it: "Invest in Dutch affordable housing. Earn a 3% target annual return
  from rent, capped by design — so families pay below-market rent." (return phrasing per
  D6; no privacy badge in the hero per D4) — the whole use-case, money and outcome in
  one breath, above the fold.
- The existing `ImpactStrip` (homes enabled, households, affordability years) stays at
  the top of **both** Home states — it is the §3 line-3 surface, not marketing chrome,
  and it does not count against the ≤3 headline-KPI budget (it's outcome, not finance).
- **Fix the "All fund metrics" disclosure** (`page.tsx:299-338`, hotspot #1): today it's
  raw protocol parameters ("Parked allocation %", "Voting window · N blocks", "Block
  production · on-demand"). Keep only user-meaningful rows (fund size, share price,
  homes enabled · households housed, investors, income paid to date); everything else
  moves to `/reference` (its sanctioned home). The disclosure gets renamed "Fund facts".
- Connected view: position headline (the §3 strip: own · pays · makes possible · exit)
  + `OverviewNextStep` unchanged.

### 4.2 Portfolio (`app/portfolio/page.tsx`) — becomes the money hub

*Job: investor source of truth; every collectable euro visible and claimable here, and
only here.*

- **Reorder to brokerage logic**: (1) headline "Total value" + the §3 strip
  (own · pays · makes possible · exit);
  (2) **"Money to collect"** panel — rental income, rewards, project payouts, unfilled
  market orders — one panel, one claim pattern (absorbs the `/rewards` claim and becomes
  the single claim surface hotspot #9 asks for; `/fund` and `/governance/[id]` keep
  status but link here to collect);
  (3) positions table (shares × NAV, income history);
  (4) readiness/verification status;
  (5) activity.
- **Personal impact, honestly attributed** (owner decision D8 — resolved: show): a compact line in the
  headline area — "Your stake is ~0.4% of a fund housing N households at covenant-capped
  rents" — the fund-level figures are real; the pro-rata attribution carries
  `ModelledChip` per §3. This is the panel that answers the investor's real question:
  *did my money do the thing we all put it in for?*
- **Kill the dead-end** (hotspot #10): "Transaction history" is a permanent EmptyState
  ("The protocol does not yet expose a per-account event feed", `portfolio/page.tsx:384`).
  Smallest honest fix: a client-side **session activity log** (record every action the
  user performs through the app: deposits, claims, votes, orders — labeled "This
  session"), plus the honest note for the historical gap. Per D5 (resolved §9) this
  session log is the scope; a real per-account feed is a follow-up ticket.
- Faucet stays behind `AdvancedDetails` "Demo tools", labeled sim-only (unchanged).

### 4.3 Invest (`app/invest/page.tsx`) — from 6-step wizard to order ticket

*Job: one guided deposit. Hotspot #2.*

- **Collapse satisfied gates**: the 6-step stepper (Connect → Verify → Fund → Amount →
  Review → Confirm) shows all steps to everyone. New behavior: gates already satisfied
  render as a single compact "Ready: connected · verified · funded" line; a returning
  verified user lands directly on **Amount**. First-time users still get the full
  stepper with inline gate resolution (unchanged pattern).
- **Review becomes a brokerage order ticket**: "You pay €1,000 → you receive 780.5 shares
  (FSFT) @ €1.2810 share price (NAV)" + one line each for **what it makes possible**
  ("your €1,000 goes toward closing the €120k financing gap on Maashaven — 12 affordable
  homes", sourced per §3), terms (capped return), exit (withdraw/secondary market), and
  privacy ("your position is private"). The ticket's last row before Confirm is the
  outcome row — the user signs off on the goal, not just the amount. All existing
  honesty caveats stay, phrased in ticket rows instead of paragraphs.
- Confirm copy per §1.2 ("Processing your private deposit…"; internals → AdvancedDetails).

### 4.4 Projects (`app/fund/page.tsx`, `app/fund/[id]/page.tsx`)

*Job: deal room → investment memo. Hotspots #6, #8.*

- `/fund` list: already good. Card labels move to lexicon terms; each card **leads with
  the human story** — who will live here and what they'll pay (covenant rent, vs market
  once J3 lands) — then the same three-line finance summary (gap being closed · capped
  return · affordability covenant). This strengthens the existing "human identity first,
  on-chain ID second" route contract rather than replacing it.
- `/fund/[id]`: **5 tabs → 3 + Advanced**: "Dossier" (default, unchanged),
  **"Funding & votes"** (merges today's Overview + Governance tabs — they both answer
  "how is this being funded/decided"), **"Payouts"** (today's Distribution). Proofs tab
  moves inside `AdvancedDetails` ("On-chain record") with its raw struct labels
  (descHash, status code, deadline block) kept verbatim — it's a sanctioned Tier-3
  surface once demoted.
- Dossier copy: lead with "the financing gap" per §1.1; `ModelledChip` usage unchanged
  (chips stay per-value, but a single "Parts of this dossier are modelled for demo"
  banner at the top of the tab replaces repeated per-section explanations, keeping the
  per-figure chips — reduces the "chip noise" of hotspot #6 without weakening honesty).

### 4.5 Secondary market (`app/dex/page.tsx`)

*Job: guarded exit/entry between investors. Hotspot #3 — currently the hardest screen.*

- **One price concept**: today three ("Last issuance reference price", "Allowed price
  band", NAV). New hierarchy: big **"Reference price €1.28"** (honest sub-label: "last
  issue price" or "NAV-based" per what it actually is — no relabeling of sources), with
  the band as a guardrail sentence: "Orders must stay within ±5% of this price." The
  band stops being a standalone stat.
- **Shield-first becomes part of the flow** (not a prerequisite error): the buy ticket
  computes the shortfall and offers "Move €X to your private balance" as an inline step
  of placing the order — one flow, one CTA at a time.
- **Order book → depth summary** ("Best ask €1.29 · 120 shares · 3 open orders"), full
  bid/ask tables inside `AdvancedDetails "Full order book"`. "Owners are anonymous"
  reframed as a trust feature: "Orders are anonymous — nobody can see who is trading."
- "Your orders" + collect flow keeps its no-order-number design (already good), with
  §1.1's reserved/collect wording.
- **Mission framing of the guardrails**: the band and the KYC gate are explained as
  protections, not friction — "prices stay tied to the value of the homes, and every
  trader is a verified investor" — turning the constraints users bump into (hotspot #3)
  into the reason this market is trustworthy and doesn't undermine the fund's goal.

### 4.6 Votes (`app/governance/*`)

*Job: decision queue. Hotspots #4, #5.*

- Label "Votes"; queue cards already memo-like — keep.
- **Stakes framing**: the queue header and each card say what the vote decides in the
  world — "You're deciding whether these homes get financed." A card's three facts are
  homes enabled, covenant rent terms, and the requested amount (all already in the
  dossier/proposal data; this surfaces them as the decision's stakes, not as metadata).
- **Role-gate the keeper actions** ("Record result", "Deploy capital & open payout"):
  rendered only for accounts with the admin flag (the account model already carries
  admin/investor chips in `HeaderWalletButton`). Ordinary investors instead see the
  status: "Voting ended — awaiting result recording." M16 means this is UI-gating only
  (no real auth), which is consistent with the demo posture; noted in-code.
- **Eligibility gate** ("Run private Fund Shares check") relabeled per §1.1 and folded
  into the vote action: pressing "Vote" when unconfirmed runs the check as step 1 of 2
  in the same flow, instead of a separate ceremony the user must discover first.

### 4.7 Verification (`app/kyc/page.tsx`)

- Checklist items rewritten as outcomes ("You can invest", "You can vote", "You can
  trade") with the requirement as the sub-line. zkPassport 3-step flow unchanged.
- "Skip verification (demo only)" stays sim/dev-gated behind AdvancedDetails; the raw
  `Phase: {phase}` debug line is removed from the visible flow.

### 4.8 Reference (`app/reference/page.tsx`)

- Unchanged in register (sanctioned Tier-3 surface) but **gains** the parameters evicted
  from Home, so nothing is deleted from the product — it's re-homed. The
  formulas/pseudo-code tab stays as the transparency artifact it is.

---

## 5. Cross-cutting mechanics

### 5.1 Debug/admin cleanup (the audit's §7)

- **"Generate dev account"** + the yellow `dev` chip leave the always-visible wallet
  dropdown (violates CLAUDE.md's own "dev accounts never in the default flow"): shown
  only when the runtime is simulation/dev, inside the dropdown's own "Demo tools"
  divider section. Admin chip stays (it now carries the §4.6 role gate meaning).
- Keeper actions role-gated per §4.6.
- The KYC debug phase line removed per §4.7.

### 5.2 Component/system unification

- **Button/Link duplication**: extend `ui/Button` with an `href` prop (renders `next/link`
  with identical classes), then sweep the ~hand-rolled `<Link className="btn btn-primary">`
  instances. One code path, one focus/loading behavior (also fixes the TODO.md a11y item
  on `HeaderWalletButton` focus rings while in there).
- **`GateCard`**: one shared component for the connect/verify/fund prompts (today each
  page hand-rolls the same "you need X → inline action" block). Standardizes the
  "resolution inline, never 'go elsewhere'" rule.
- **`lib/format.ts`**: canonical EUR (`€1.281,50` nl-NL vs `€1,281.50` en — pick one,
  D7), share amounts (4 dp max), percentages (1 dp), relative time ("closes in 2 days")
  with absolute on hover. All screens migrate to it; no more per-page `toLocaleString`.
- **Lexicon module + guard test** per §1.

### 5.3 Lifecycle vocabulary v2

`lib/proposalLifecycle.ts` `displayStatus()` stays the single source; the payout-side
labels change with the Distribution→Payout rename: "Funded → **Paying out** → **Fully
paid**" (was "Distributing → Fully claimed"). The existing Vitest canonical-vocabulary
guard is updated in the same commit — it must stay green with the new words.

### 5.4 Mobile + accessibility audit (closes the TODO.md item)

Fold the deferred mobile pass into this overhaul's final phase: every route at 375px —
KPI grids reflow, DataTables degrade to cards/scroll, stepper + order ticket comfortable,
touch targets ≥44px, safe-area insets on drawer/bottom-nav. Plus the a11y sweep: focus
rings everywhere (incl. wallet menu), status never color-alone, `aria` on the new
disclosure/ticket patterns.

---

## 6. What explicitly does not change

- Brand tokens, fonts, illustrations, light-only theme, no new dependencies (no shadcn,
  no icon libs).
- The honesty rule and every honest label ("Demo network · no real funds", "Publicly
  registered investors", ModelledChip semantics, no-APY rule).
- Privacy-as-assurance architecture (TrustChip, ProofRail) — copy sharpened per §1.2 only.
- The sim/live dual-mode architecture, `lib/contracts.ts` seam, API routes (no
  exceptions — D5 resolved to the frontend-only session log).
- Contracts. Zero on-chain changes.
- The canonical economic model (NAV vs rental income separation) — this plan re-expresses
  it, never remixes it.

---

## 7. Phasing

Each phase is independently shippable and ends with typecheck + build + Vitest green
(`npm run typecheck`, `NEXT_DIST_DIR=.next-verify npx next build`, `npm test`), plus the
route-level checks listed. Sequence chosen so language lands first (cheap, high-visibility)
and the hardest screen (market) lands late with the patterns already proven.

| Phase | Scope | Key files | Validation |
|---|---|---|---|
| **0. Foundation** | `lib/lexicon.ts`, `lib/format.ts`, lexicon guard test, `Button href` unification, `GateCard` | `lib/`, `ui/Button.tsx`, new `ui/GateCard.tsx` | Guard test red on seeded Tier-3 strings, green after; no visual regressions |
| **1. Rename & re-home** | Nav labels (Votes, Secondary market), `/rewards` → portfolio fold + redirect, education de-dup, Home metrics eviction → Reference, lifecycle vocab v2 | `lib/nav.ts`, `app/rewards/*`, `app/learn`, `app/explain`, `app/page.tsx`, `app/reference`, `lib/proposalLifecycle.ts` | Every old deep link resolves; lifecycle Vitest green with new words |
| **2. Portfolio = money hub** | Reorder, "Money to collect" panel, session activity log, §3 strip (own · pays · makes possible · exit), personal impact line (D8) | `app/portfolio/page.tsx`, `components/portfolio/*` | A connected sim user can find and claim every collectable euro from one panel, and say what their stake makes possible |
| **3. Invest = order ticket** | Gate collapsing, ticket review incl. the outcome row, confirm copy | `app/invest/page.tsx`, `components/invest/*` | Verified+funded user reaches Amount in one screen; first-timer still fully guided |
| **4. Projects & votes** | Tab merge 5→3+Advanced, dossier copy, human-story card lead, vote stakes framing, keeper role gate, eligibility fold-in | `app/fund/[id]/*`, `components/projects/*`, `app/governance/*`, `components/governance/*` | Non-admin sees no keeper buttons; vote flow is one entry point; a voter can say what the vote decides in the world |
| **5. Secondary market** | Price hierarchy, inline private-balance step, depth summary + advanced book | `app/dex/page.tsx`, `components/trade/*` | A user who has never seen an order book can place a buy within the band unaided |
| **6. Sweep & audit** | Debug/admin cleanup (§5.1), mobile + a11y pass (§5.4), copy QA, CLAUDE.md updates (route contracts, lifecycle words, the stale "Plus Jakarta Sans" reference → DM Sans/Nexa) | shell components, all routes, CLAUDE.md | §8 script passes; screenshots desktop+mobile per route |

Estimated shape: phases 0–1 are small; 2–5 are each roughly a `/fund/[id]`-sized effort;
6 is broad but mechanical.

---

## 8. Success criteria — the average-day-user script

The overhaul is done when a tester matching the §0 persona completes these unaided in a
sim-mode session, and the automated guards hold:

1. **60-second test (kept, sharpened):** after Home only, they can say what is funded,
   **who benefits and how** (families renting below market, locked by covenant), what
   they'd receive ("~3% capped return from rent"), the main risk, and the next action.
2. **Invest €100** starting from Home, without opening More — and say afterwards what
   the €100 makes possible.
3. **Find and claim** their rental income, and say in one sentence how it differs from
   their share value.
4. **Vote** on the open funding request, and say what stayed private.
5. **Describe both exits** (withdraw vs sell on the secondary market) and start a sale
   order within the price band.
6. **Guards:** lexicon test green (no Tier-3 terms in primary UI), lifecycle vocabulary
   test green, one primary CTA per screen (manual audit), every gate resolvable inline,
   no keeper/debug controls visible to a non-admin, non-sim user.

---

## 9. Owner decisions — RESOLVED 2026-07-15

All eight decisions were put to the owner and resolved in-session. D4 diverges from the
doc's original recommendation; the D4-dependent sections (§0, §1 Tier-2 table, §1.2,
§4.1 hero) have been updated to match. These are binding for implementation.

| # | Decision | **Resolution (owner, 2026-07-15)** |
|---|---|---|
| D1 | Merge `/learn` + `/explain` into one route vs re-scope both | **Re-scope both** (§2) — `/learn` = why, `/explain` = how + glossary; `/explain#…` deep links keep working |
| D2 | `/rewards` route fate | **Fold into `/portfolio` + redirect** — one claim surface; program explanation moves to `/explain#rewards` |
| D3 | "Governance" vs "Votes" nav label | **"Votes"** — the objects stay "funding requests" |
| D4 | How far to lean into crypto register for privacy | **Keep it minimal** *(diverges from the doc's badge recommendation)* — privacy stays quiet assurance: TrustChip + `/explain#privacy` + existing honest inline labels only; no new badges on Invest/Portfolio |
| D5 | Activity feed: session-local log vs real per-account event feed | **Session-local log now** ("This session" label + honest historical-gap note); the real feed becomes a follow-up ticket — overhaul stays frontend-only |
| D6 | Phrasing the capped return as a rate given the no-APY rule | **Adopt "3% target annual return — capped by design"** — the ROR formula stated honestly; the no-APY rule itself stays for everything else |
| D7 | Number locale | **English formatting with € symbol** (`€1,281.50`) via one canonical `lib/format.ts`; revisit if the app localizes |
| D8 | Personal impact attribution on Portfolio | **Show, with `ModelledChip`** on the pro-rata attribution per §3; fall back to fund-level framing if per-home math over-claims at tiny stakes |

---

## Implementation log

- **Phase 0 landed** (`e87e1d3`): `lib/lexicon.ts`, `lib/format.ts` (+tests), the
  Tier-3 ratchet guard (`lexicon.test.ts`, baseline: 17 files), `ui/Button href`,
  `ui/GateCard`. Also removed an upstream-committed `frontend/node_modules` symlink
  and hardened `.gitignore` (`c3cbc5c`).
- **Re-baseline note (2026-07-15):** the §4/§Appendix audit mapped the local main
  checkout, which turned out to be *behind origin* — origin's branch had already
  delivered several §2 items before implementation started: `/invest`, `/rewards`,
  `/explain`, `/reference` are folded and redirect via `next.config.ts`; primary nav
  is Home · Homes · Portfolio with Vote/Trade/Verification under More; learn+explain
  are merged into one About door (`components/about/`). File:line references in §4
  and the Appendix describe the audited tree, not necessarily origin — phases 2–5
  re-verify against the live tree before editing. The Phase 0 ratchet baseline was
  computed on origin's tree and is accurate.
- **Phase 1 landed, adapted to the re-baseline** (`87251b0`): "Votes" +
  "Secondary market" nav renames (D3/§2); payout vocabulary v2 via canonical
  `PAYOUT_LABELS` ("Paying out"/"Fully paid", §5.3) with the Vitest guard extended;
  `lib/format.ts` made the canonical home of the pre-existing
  formatEUR/formatEURDecimals/formatFSFT (contracts.ts re-exports); ratchet
  burn-down 17 → 12 files (record_rent and AIP-* mentions rewritten).

## Appendix: audit trace

This plan is grounded in a 2026-07-15 full-frontend audit (13 routes, ~21.6k lines).
Hotspots referenced by number in §4:

1. Home "All fund metrics" = raw protocol parameters (`app/page.tsx:299-338`)
2. Invest 6-step stepper + NAV-vs-issuance mental load (`app/invest/page.tsx`)
3. DEX three price concepts + shield-first + full order book (`app/dex/page.tsx`)
4. Governance finalize/execute exposed to all users (`components/governance/OverviewTab.tsx:153-188`)
5. Separate vote-eligibility ceremony (`app/governance/page.tsx:233-245`)
6. Dossier jargon density + per-block modelled chips (`components/projects/ProjectDetailDossier.tsx`)
7. Formulas pseudo-code (sanctioned, stays in Reference) (`components/reference/ProtocolFormulas.tsx`)
8. Proofs raw struct dump (`components/projects/ProjectDetailProofs.tsx`)
9. Two-place claims: rewards on `/rewards` + `/portfolio`; distributions on three routes
10. Portfolio history permanent dead-end (`app/portfolio/page.tsx:384`)

Debug/admin exposure: "Generate dev account" + `dev` chip in the always-visible wallet
menu (`components/HeaderWalletButton.tsx:106-116,152`), ungated keeper actions (above),
KYC `Phase:` debug line (`components/KYCFlow.tsx:192`).

Known-good to preserve: ModelledChip honesty system, TrustChip/privacy-as-assurance,
canonical lifecycle vocabulary + its Vitest guard, skeleton/empty/error state coverage,
account-switch race guards, the no-order-number DEX claim design, and the
`ImpactStrip`/`aggregateImpact` impact layer — promoted by this plan from an Overview
widget to the §3 line-3 surface rendered beside money figures app-wide.
