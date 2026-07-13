# UX simplification plan

*Written 2026-07-12 from a user-POV audit of the running app (sim mode, production
build, branch `feat/ux-simplification`). Companion to `JOURNEY_FRONTEND_PLAN.md`;
the loop iterations implement straight from this document.*

The test applied to every screen: does it serve one of the three persona sentences
below? If not, it is a candidate for cutting, merging, or demotion. Simplification
here means **less** — fewer destinations, fewer names for the same thing, fewer
decisions per goal — not more polish.

## 1. The three persona sentences

- **Small saver / investor** — "put money in safely, see what it's worth, get my
  earnings, take my money out, have a say in what we buy."
- **Property owner** — "get my property assessed and funded, know where I stand."
- **Council member** — "review what's waiting for me, judge it well, move on."

## 2. What the walk found

### The saver (the main persona)

- **Put money in:** connect → verify (`/kyc`) → fund test wallet (faucet) →
  deposit (`/invest`). 4 pages, ~6 decisions. The deposit page greets them with
  "NAV per share / Net asset value per FSFT" — pricing jargon before the first
  euro moves. The journey stepper carries this flow well; the pages it lands on
  don't match its plain voice.
- **See what it's worth / get earnings:** `/portfolio` has the right KPIs
  (position value, fund shares, rent earnings, rewards) — but "get my earnings"
  is split across **four different claim verbs on three surfaces**: claim rent /
  reinvest rent (portfolio), claim distribution (governance proposal modal),
  claim rewards (`/rewards` → which itself says "Claiming itself happens in your
  account → Go to account" — a page whose only action is leaving it).
- **Take money out:** the withdraw form accepts any amount, then the API answers
  *"No DepositNote with the exact requested amount. V2 withdraw consumes a whole
  note; partial withdrawals are not yet implemented."* A protocol constraint
  surfaced as a form error the user can only resolve by guessing their own past
  deposit amounts.
- **Have a say:** `/governance` works, but greets them as an "Investment
  committee" making "Funding decisions" — bank language for a community vote,
  and the same home they saw as a *project* on `/fund` now appears as a
  *funding request*, and again in the *funding queue*. **One home wears four
  names across four surfaces** (listing → project → funding request → queue
  entry). That is the single largest source of conceptual load in the app.

### The owner

Good shape: stepper → "Submit a property" → 4-step wizard with fields the owner
actually knows (ask, market rent, documents; hashing handled invisibly). Friction
is low; discoverability depends on the stepper, which works.

### The council member

Good shape: role-gated queue on `/governance`, inline 0–100 score + approve /
reject. One gap: the score's meaning ("price-quality judgment", feeds funding
priority) is never explained where it is asked.

### Everyone

- **11 destinations** for three one-sentence personas (3 primary tabs + 5 under
  More + 3 reference pages). `/invest` is officially "contextual, not a tab" (per
  `nav.ts`) yet still exists as a destination with a full page; `/rewards` has no
  action; learn / explain / reference are three flavors of "about".
- **The footer repeats the entire nav** (14 links, "Invest" twice) on every page.
- First paint shows "**Mode unknown**: the runtime could not be determined yet…"
  — an internal diagnostic as the first words a visitor reads (it resolves
  client-side, but it is the SSR text and the first-frame experience).
- `/dex` is honestly demoted ("Most investors never need this") — correct posture,
  keep — but its explainer still opens with "you must shield EUR into your
  private balance", the app's densest jargon moment.

## 3. Ranked backlog

Cuts and merges first; each item names the persona sentence it serves.

| # | Change | Type | Serves | Impact | Effort |
|---|---|---|---|---|---|
| S1 | **One home, one card.** Merge `/fund`'s three sections (projects table, onboarding listings, funding queue) into a single Homes page: one card per home carrying its full lifecycle (submitted → council review → open for vote → in funding queue → owned), with the vote CTA deep-linking into the ballot and the queue rank shown on the card. `/governance` keeps only ballots. Kill the four-names problem at the root. | merge | all three | high | M |
| S2 | **Retire `/rewards` as a destination.** Fold the reward summary + claim into `/portfolio`; route redirects. | cut | saver: earnings | high | S |
| S3 | **Fold `/invest` into `/portfolio`.** Deposit and withdraw are account actions; portfolio becomes the money hub (value, deposit, withdraw, every claimable). Stepper and home CTAs deep-link to its deposit section. | merge | saver: in/out | high | S–M |
| S4 | **One About page.** Merge learn / explain / reference into a single reference destination with three sections (mission → how it works → parameters). | merge | everyone | med | S |
| S5 | **One claim pattern.** A single "Ready to claim" list on portfolio (rent, payouts, rewards as rows, one Claim button each; reinvest as a row option). Distribution claims stop living only inside the governance modal. | default | saver: earnings | high | M |
| S6 | **Withdraw as a pick-list.** Show the user's deposits as rows ("€10,000 — deposited 12 Mar") with a Withdraw button per row, instead of a free-amount field that only accepts exact-note amounts. Turns the protocol constraint into a natural UI. | restructure | saver: out | high | S–M |
| S7 | **Plain-language pass on default paths.** "NAV per share" → "value per share"; FSFT → "fund shares" (ticker in tooltip); FSP → "reward points"; "quorum" → "votes needed"; "covenant" → "affordability agreement" (term on demand); "distribution" → "payout"; kickers "Deal room" / "Investment committee" → community voice ("Homes", "Community vote"). Technical term lives in the tooltip, not the headline. | reword | everyone | high | S |
| S8 | **Footer diet.** Replace the 14-link nav mirror with: About · GitHub · fair-squares.nl · mode chip. | cut | everyone | med | S |
| S9 | **First-run persona hand-off.** After connect, one question — "What brings you here?" (invest / I have a property / council) — landing each persona on their first step. Complements the stepper; also fixes the SSR "Mode unknown" first-frame (neutral "Checking network…" until resolved). | default | all three | med | S–M |
| S10 | **Council score hint.** One sentence where the score is asked: "0–100, your price-quality judgment — it sets funding priority." | reword | council | low | S |

## 4. Target information architecture

11 destinations → 7.

| Destination | Keeps | Rationale |
|---|---|---|
| Home `/` | journey stepper + position snapshot | the guided spine; answers "where am I, what's next" |
| Homes `/fund` | every home's lifecycle card + submit CTA (S1) | one place, one name for the object everyone cares about |
| Portfolio `/portfolio` | value, deposit, withdraw, unified claims, rewards (S2/S3/S5/S6) | the saver's whole sentence on one page |
| Vote `/governance` | ballots + council queue tab | the one deliberate community act; council work rides along role-gated |
| Trade `/dex` | unchanged, stays demoted under More | honest optional venue |
| Verification `/kyc` | unchanged, under More | once-per-life task |
| About `/learn` | mission + how it works + parameters (S4) | one reference door instead of three |

## 5. Non-goals

- The design system (tokens, primitives, typography) — this is an IA and language
  pass, not a redesign.
- Contract semantics and the sim/live parity machinery — UI only.
- Operator/keeper endpoints (`fund/rent`, `fund/ror`) — script surfaces, not UX.
- The DEX's internals — it stays demoted; only its opening sentence gets S7.
- Removing information the repo's honesty rules require (ModelledChip, proof
  rails, source citations) — simplify around them, never delete them.

## 6. Measures of done

- Saver completes "money in" in ≤ 2 destinations after connect; "money out"
  without knowing note amounts; all earnings claimable from one list.
- Every home shows exactly one card that tells its whole story.
- No default-path headline uses FSFT / NAV / quorum / covenant / distribution
  without a plain-language primary label.
- Nav ≤ 7 destinations; footer ≤ 4 links; build + tsc green; sim walkthrough
  (DEMO_RUNBOOK journey section) still passes end to end.

## 7. Result (implemented 2026-07-12, this branch)

All ten items landed (commits `2e14e8b`, `b06dd46` + follow-up). Verified against
the production build in sim mode:

| Measure | Before | After |
|---|---|---|
| Destinations | 11 | **7** (route manifest: / · /fund · /fund/submit+[id] · /portfolio · /governance+[id] · /dex · /kyc · /learn) |
| Footer links | 14 (nav mirror, "Invest" twice) | **4** (About · GitHub · fair-squares.nl · runtime chip) |
| Names for one home | 4 (listing / project / funding request / queue entry) | **1** — one card, one lifecycle strip (council review → community vote → funding → owned) |
| Saver: get earnings | 4 claim verbs on 3 surfaces | **one "Ready to claim" list** on Portfolio |
| Saver: money out | free-amount field, exact-note guessing | **pick-list of your actual deposits** (live notes / sim lots, incl. reinvested rent) |
| Saver: money in | 4 pages (/kyc → faucet → /invest) | guided flow ON Portfolio (same real-state gating), home stepper deep-links to it |
| Default-path headlines using NAV / quorum / distribution / shield | throughout | **zero in rendered HTML** (terms live on in tooltips and the About parameters panel) |
| First frame | "Mode unknown: the runtime could not be determined…" | "Checking network…" |
| First-run | no orientation | "What brings you here?" hand-off (3 paths, dismissible, auto-hides once the account has a position or role) |
| Old URLs | — | /invest, /rewards, /explain, /reference all 307-redirect to their new homes (verified) |

Council score input now explains itself (S10); the vote page speaks community
("Community vote / Vote on homes / Ballots"), not committee. The legacy direct
proposal form left /governance — homes enter the vote from the Homes page only.

Verification: `tsc --noEmit` and `npm run build` clean; redirects, page renders,
voice, and jargon counts checked against the running production build. The
connected-only surfaces (portfolio sections, council queue, hand-off card)
render client-side behind the wallet context, so they are covered by the type
system and build rather than SSR grep — the sim-mode journey walkthrough in
DEMO_RUNBOOK.md §journey remains the end-to-end check.
