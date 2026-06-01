# Fair Squares — Demo Runbook (8–10 min)

> Operationalises [`FUTURE_DEVELOPMENT_PLAN.md` §9](./FUTURE_DEVELOPMENT_PLAN.md).
> Goal: a believable, end-to-end demo that makes a housing partner (a Rotterdam
> corporation, a wooncoöperatie, an impact investor) say *"I understand what this
> does and I'd pilot it"* — **without ever presenting a modelled number as real.**

## 0. The one rule

Every number on screen is either **verifiably real** (deposit / vote / execute /
claim / NAV reads from the local Aztec network) or **chip-labelled "Modelled for
demo"** (the project dossier's capital stack, covenant, milestones, impact, and
the capped-return split). No exceptions — that honesty *is* the pitch for this
audience.

- Real = no tag. Modelled = a dashed magenta `Modelled for demo` chip
  (`<ModelledChip />`, built on `.chip-sim`).
- The dossier draws the bridge explicitly: the on-chain proposal amount
  *represents* the Fair Squares capped-return tranche of a (modelled) capital
  stack — the two are never conflated into one euro figure.

## 1. Start it (one command, laptop-only)

```bash
docker compose --profile aztec up      # local Aztec node + PXE, contracts, frontend, seed
```

The `aztec` profile deploys the contracts, issues KYC to the three test
accounts, and runs `scripts/seed-fsft.sh`, which leaves a **demo-ready** state
(no manual clicks). Open http://localhost:3000.

### What the seed plants (verify before demoing)

`seed-fsft.sh` defaults (override via env if needed):

| Knob | Value | Why |
|---|---|---|
| `DEPOSIT_EACH` | `10000` ×3 = **30 000** total | At/under the 10 000 small-deposit threshold, so all three accounts are "small" and every depositor claims a non-zero share. |
| `PROPOSAL_AMOUNT` | **20 000** | Deliberately *below* total deposits, so the fund still shows ~**10 000 "Available to deploy"** — the demo-headroom fix (docs/TODO.md). |
| `PROPOSAL_TITLE` | `Maashaven Wonen — Rotterdam` | Resolves the project **dossier** (`frontend/src/lib/projectDossier.ts`) on `/fund/[id]`. |

After seeding: 30 000 deposited · 20 000 committed to the funded project ·
~10 000 available · all three accounts hold FSFT (12 000 / 6 000 / 2 000 — the
FIFO + 30 % small-floor split, reconciling exactly to 20 000).

## 2. The walkthrough (3 personas, 1 project)

Lead with **housing**, not crypto. The first screen is the Overview's
**Affordable-housing impact** strip and the project **dossier** — not a token
balance or the DEX.

### Beat 1 — Sofie, the small saver (`/` → `/kyc` → `/invest`)
- **Overview** leads with the impact strip: *homes enabled · affordability-years ·
  capital gap closed · 30 % floored to small savers*. The first three are tagged
  modelled; **the 30 % small-saver floor is a live on-chain parameter** (no tag).
- Sofie connects → passes KYC (zkPassport dev path) → deposits **€200** on
  `/invest`. Her deposit is **private** (only she sees the amount) while the fund
  total updates publicly.
- *Beat:* "€200 buys real affordable-housing exposure, and the small-depositor
  floor *over*-allocates to her vs. a whale — equity by design, enforced in the
  circuit."

### Beat 2 — Pieter, the impact investor (`/fund` → `/fund/[id]`)
- Open the deal room (`/fund`) → the Maashaven project → it **opens on the
  Dossier tab** (housing first). Show:
  - **Capital stack** — senior bank debt · public subsidy · member capital ·
    **Fair Squares capped-return layer**; the gap line bridges to the on-chain
    request.
  - **The financing gap** — the documented *onrendabele top* Fair Squares closes.
  - **Affordability covenant** — rent band, key-worker target group, 20-year
    lock, clawback.
  - **Returns & the affordability cap (D2)** — investor return capped at ~3.5 %
    net; surplus protects affordability. (Modelled covenant policy; the on-chain
    claim is unchanged.)
- Switch to **Distribution & capital** / **Proofs & on-chain** to show the same
  project's **real** figures (votes, pool, deed, raw fields).
- *Beat:* "auditable, capped, covenant-locked, privacy-preserving — the ESG
  paper-trail his committee needs." If he connects with investor standing, the
  **sensitive rows** (member capital, eligibility evidence, underwriting)
  unlock — the public/private split made concrete.

### Beat 3 — Governance + claim, the real spine (`/governance` → `/portfolio`)
- The seed already executed one proposal. To show it live, create/▶vote a new
  proposal sized **below** the ~10 000 available, reach quorum, **execute**
  (`open_distribution`), then **claim** on `/portfolio`. Numbers reconcile
  exactly (FIFO + 30 % small-floor).
- *Beat:* "fair, deterministic, on-chain distribution — no admin discretion."

### Beat 4 — Lana, the tenant (dossier "Tenants build equity")
- On the dossier, the **rent-to-equity** section: a tenant accrues a small FSFT
  slice from each rent payment — the moral core. Labelled **on the roadmap**
  (not yet a live transaction — see "What's next").
- *Beat:* "the person living there becomes a part-owner, privately."

## 3. Real vs. modelled — say it out loud

| Real (on-chain, this network) | Modelled for demo (tagged) |
|---|---|
| KYC → deposit → vote → execute → claim | Project capital stack & financing gap |
| FIFO + **30 % small-depositor floor** split | Affordability covenant (rent band, target, lock, clawback) |
| Distribution pool, claimed, snapshot deposits | Capped-return (~3.5 %) + reserve split |
| Property deed (AIP-721), NAV-per-FSFT | Milestones, homes-enabled, affordability-years |
| Private balances + public aggregates | Rent-to-equity (roadmap) |

## 4. Cut line — out of demo scope (name on the "what's next" slide, don't fake)

Real DeFi yield · live NAV oracle · redemption queue · staking/fees · external
audit · legal wrapper/SPV — all **production** concerns (`FUTURE_DEVELOPMENT_PLAN.md`
§3–§4). **D3 rent-to-equity as a live tenant→FSFT transaction** is the next build
(here it is a labelled roadmap teaser, not a faked flow).

## 5. Definition of done (per §9.5)

- Runs end-to-end from one command; no testnet, no real funds.
- A non-crypto partner can narrate "what is funded, what gap is closed, what
  affordability is protected, what I own, what was privately verified" from the
  screens alone.
- Every number is verifiably real **or** chip-labelled "Modelled for demo".
- Passes the §0.6.1 equity gate: visibly caps returns, shows distribution to
  small savers + a tenant, and is honest that durable yield/redemption are
  production work.
