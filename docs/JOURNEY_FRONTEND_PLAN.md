# Journey frontend plan

*Written 2026-07-12. Companion to `JOURNEY_COMPLETION_PLAN.md` (J1–J7) — this is the
frontend half of that plan, grounded in the existing app. It layers the journey on top
of the IA in `frontend-redesign-design-doc.md`; it does not replace that doc.*

**Reuse before build:** the app already ships the primitives this plan needs —
`ui/Stepper`, `EmptyState`, `KpiCard`/`KpiGrid`, `DataTable`, `StatusChip`, `FormField`,
`ActionBar`, `Tooltip`, `ProofChip`/`ProofRail`, `ModelledChip`, `LoadingSkeleton` — plus
an `/api/property` namespace and persona wiring in `HeaderWalletButton`. Every item below
names the primitive it composes; new components are listed explicitly.

---

## 0. Foundations (phase 0 — before any journey UI)

1. **Truthful transaction results.** Every write route returns the real outcome
   (`getAztecTxOutcome`, review §3.1 item 5) and every mutation in `lib/contracts.ts`
   checks `res.ok` + reads the API error. A journey stepper built on false "success"
   responses would guide users into dead ends.
2. **State conventions everywhere:** `LoadingSkeleton` while fetching, `Alert` with the
   *real* revert reason on failure, `EmptyState` with a CTA when a list is empty
   (CLAUDE.md: no fallback values, no silent catch).
3. **Personas:** extend the account switcher with named demo personas — investor, property
   owner, council member, admin/keeper — each badged (the investor badge pattern exists;
   add owner + council badges once J1/J2 roles land).

## 1. Information architecture change

`/` becomes the **journey home**: the stepper at the top, the portfolio snapshot beneath
it — answering both owner asks (guided journey + total overview at a glance) on one
screen. Existing routes stay as destinations; nav order mirrors the journey:

```
/            Journey + overview   (stepper + KpiGrid snapshot)
/fund        Properties           (browse, submit — J1; funding queue — J4)
/invest      Deposit / withdraw
/governance  Proposals + votes    (+ council queue tab — J2)
/portfolio   Full portfolio       (J6)
/dex         Trade
/rewards     Rewards
/kyc         Verify
/learn /explain /reference        unchanged (explain content reused inline — J5)
```

## 2. Per-workstream frontend specs

### J1 — Submit-property wizard (owner persona)

- **Route:** `/fund/submit`, role-gated to `PROPERTY_OWNER` (EmptyState with "switch to
  the demo owner" CTA otherwise).
- **Flow (`ui/Stepper`, 4 steps):** property details → ask + market rent reference →
  documents (hash client-side, show the hash next to each file with `ProofChip`; file
  itself goes to the demo store) → review & sign (`ActionBar`).
- **Components:** `ListingCard` (new; composes `StatusChip` for
  SUBMITTED / COUNCIL_APPROVED / PROPOSED / rejected), listing detail with dossier
  hashes on the `ProofRail`.
- **API:** `POST /api/property/listings`, `GET /api/property/listings[?status=]`.

### J2 — Council queue (council persona)

- **Route:** council tab inside `/governance`, role-gated.
- **UI:** `DataTable` of SUBMITTED listings → row expands to dossier (hashes, ask,
  market ref) → quality-score input (0–100, `FormField`) + approve / reject `ActionBar`.
  Approved rows show the score `StatusChip` that J4's queue will reuse.
- **API:** `POST /api/governance/council` (approve/reject + score),
  council state merged into `GET /api/property/listings`.

### J3 — Rent-vs-market surface

- **Component:** `RentComparison` (new, pure presentational): "market €X → capped €Y
  (−Z%)" with a baseline `StatusChip` when Z ≥ 20. Placed on property cards, property
  detail, and the funding queue rows.
- **Provenance rule:** the comparison renders only from on-chain covenant + attested
  market ref (no `ModelledChip`); `/learn` gains the baseline stat next to the real ROR.
- **API:** `baselineBps`, `marketRentRefEur`, covenant fields joined into
  `/api/property` and `/api/fund/stats` responses.

### J4 — Funding queue

- **UI:** section on `/fund`: `DataTable` ranked by priority, each row showing score,
  discount depth, ask vs liquid capital, and a "why this rank" `Tooltip`; permissionless
  "run matching" button (`match_next`) with the resulting funding event surfaced.
- **API:** `GET /api/fund/queue`, `POST /api/fund/queue` (action `match_next`).

### J5 — Journey stepper (the home)

- **Component:** `JourneyStepper` (new; composes `ui/Stepper`): Verify → Deposit →
  Properties → Vote → Track. Each step derives done / next / blocked from the current
  account's real state and deep-links the single action that advances it.
- **State source:** client-composed from existing endpoints (`/api/kyc/status`,
  `/api/portfolio`, `/api/property/listings`, `/api/governance/proposals`) — no new
  journey endpoint until composition proves too chatty; if it does, add
  `GET /api/journey/state` as a thin server-side join.
- **Inline explain:** step-level "what happens on-chain?" popovers (`Tooltip` +
  extracted `/explain` content modules) instead of a page hop.

### J6 — Portfolio + fund overview

- **`/portfolio`:** `KpiGrid` (deposited, FSFT balance × NAV/FSFT, claimable income,
  rewards earned) → claimables list with claim CTAs (`ActionBar`) → per-property
  exposure `DataTable` (FSFT share × property NAV weight — needs the J4 property
  weights) → open DEX orders + votes → activity history.
- **Fund overview on `/fund`:** NAV + NAV/FSFT trend (`GET /api/fund/nav-history`,
  fed by snapshots at `record_asset_sale` / rent epochs), property table with covenant
  columns (ceiling, −Z%, lock expiry, `RentComparison`), distribution + rent-epoch
  history.
- **Honesty:** anything simulated (DeFi yield) keeps `ModelledChip`; everything else
  must trace to a contract read.

## 3. New API surface (summary)

| Route | Method | Serves |
|---|---|---|
| `/api/property/listings` | GET/POST | J1 submit + browse, J2 queue input |
| `/api/governance/council` | POST | J2 approve/reject + score |
| `/api/fund/queue` | GET/POST | J4 ranking + `match_next` |
| `/api/fund/nav-history` | GET | J6 NAV trend |
| existing `/api/portfolio`, `/api/fund/stats`, `/api/property` | extend | J3 fields, J6 exposure/claimables |

All new routes follow the phase-0 rules: real outcome checks, no fallback values, errors
propagate with their revert reason.

## 4. Quality gates

- `npx tsc --noEmit`, `npm run build` per PR; vitest units for the pure logic
  (rank explanation, rent-comparison math, journey-state derivation) — the vitest
  harness already exists.
- Accessibility follows the `TradeTicket` pattern (labelled fields, `aria-invalid`,
  described-by error ids) for every new form.
- Each phase ends with its `DEMO_RUNBOOK.md` walkthrough recorded against the UI, per
  persona.

## 5. Sequencing

Tracks the main plan's phases: 0 (foundations) → 1 (J1+J2 screens) → 2 (J3 surface) →
3 (J4 queue) → 4 (J5 stepper home + J6 portfolio — parallelizable once the APIs above
exist). Website parity per phase is J7 in `JOURNEY_COMPLETION_PLAN.md`.
