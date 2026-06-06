# Aztec Project

This file is the canonical agent guide for this repo. [AGENTS.md](./AGENTS.md) is a stub that points here so Codex (and any other tool that reads `AGENTS.md`) gets the same instructions.

## Critical: Use the host `aztec` CLI, not `nargo` directly

This is an Aztec smart contract project. The host CLI is installed at
`$HOME/.aztec/current/bin` (added to PATH via `.bashrc`). Always use the
`aztec` wrapper instead of calling `nargo` directly:

- **Compile (full artifact, for deploy)**: `aztec compile` (NOT `nargo
  compile`). Using `nargo compile` alone produces ACIR without the AVM
  transpilation + VK generation that the wallet/deploy flow needs.
- **Test**: `aztec test`. Host CLI bundles its own TXE and handles the
  oracle resolver automatically -- no docker needed.
- **Wallet ops**: `aztec-wallet` (also on PATH).
- **Other nargo commands** like `aztec-nargo fmt` and `aztec-nargo doc`
  are fine to use directly.

Install / reinstall:

```bash
VERSION=4.3.0 bash -i <(curl -sL https://install.aztec.network/4.3.0)
```

Confirms with `aztec --version` -> `4.3.0`, `aztec-nargo --version` ->
`1.0.0-beta.21`, `aztec-wallet --version` -> `4.3.0`.

### Iteration timings (host CLI, warm cache)

- Single-contract `aztec compile`: ~20-25 s (full transpile + VK gen).
- Single-contract `aztec test` (compile cached): ~5-6 s.
- Full 5-contract V2 test suite via `./scripts/aztec-test.sh`: ~30 s.

There is a separate `~/.local/bin/nargo` left over from an earlier
extraction -- still works, but prefer `aztec-nargo` (or just `aztec
compile` / `aztec test`) so the artifact paths match what TXE and the
deploy tooling expect.

### Docker fallback

The previous docker-based test script is kept opt-in for environments
where the host CLI cannot be installed (e.g. CI without internet
access during the install step). Run with `FS_AZTEC_TEST_DOCKER=1
./scripts/aztec-test.sh`. The named `aztec-nargo-cache` docker volume
still persists git deps across runs for that path.

## Error Handling

- NEVER silently swallow errors or fall back to default values. If a value is required, throw if it's missing.
- NEVER use fallback values like `AztecAddress.ZERO`, `"unknown"`, `0`, or `null` to mask missing data. These hide bugs and cause failures elsewhere that are harder to trace.
- NEVER add retry/polling logic unless explicitly asked. Retry loops with long timeouts may brick application loops and mask the real error.
- NEVER wrap calls in try/catch that returns null or a default. Let errors propagate.
- If a precondition isn't met, throw immediately with a descriptive message -- don't try to "work around" it.
- Prefer `T` return types over `T | null` when null would indicate a bug rather than a valid state.
- Do not add `.catch(() => defaultValue)` to promises. If something fails, the caller needs to know.

## Version Compatibility

The Aztec developer SDK/aztec-nr version (used for writing and compiling contracts) may differ from the node version (used by operators to run the network). Check the [Networks page](https://docs.aztec.network/networks) for current network versions. When in doubt, use the version from the developer docs you are reading -- it is the correct SDK version for contract development on that network.

## Hashing: Default to Poseidon2

When writing Aztec.nr contract code that requires hashing, **always use Poseidon2** unless a specific protocol or interoperability requirement calls for a different hash.

- **Default**: `use aztec::protocol::hash::poseidon2_hash;`
- **Do NOT** default to Pedersen (`pedersen_hash`). Pedersen is available but Poseidon2 is cheaper in circuits and is the standard across Aztec.
- If you are unsure which hash to use, use Poseidon2.

## Testnet smoke test

To verify the pinned `@aztec/aztec.js` (v4.3.0) talks to the public Aztec testnet:

```bash
cd scripts
AZTEC_NETWORK=testnet npx tsx smoke-testnet.ts
```

Expected output: chain_id 11155111 (Sepolia), a current block number, and a non-zero version field. Anything else means PXE quota / version mismatch.

### Full testnet deploy (Stage 6.5)

```bash
# 1. Create / fund a Schnorr account via SponsoredFPC (~1-3 min).
AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-account.ts
#    Output: scripts/.testnet/account.json (gitignored; contains secret).

# 2. Deploy all 9 contract instances + wire set_contracts / set_admin links
#    + issue a private KYC credential to the deployer (~5-15 min).
AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-contracts.ts
#    Output: scripts/.testnet/contracts.json
#            frontend/.env.testnet  (NEXT_PUBLIC_* keys ready to use)

# 3. Run the frontend pointing at testnet (Vercel or local).
#    cp frontend/.env.testnet frontend/.env.local
#    cd frontend && AZTEC_NETWORK=testnet AZTEC_LIVE=true npm run dev
```

The SponsoredFPC address is derived deterministically from the upstream
artifact at salt=0 -- no env lookup needed. `testnet-deploy-contracts.ts`
refuses to overwrite an existing `scripts/.testnet/contracts.json`
unless `FS_TESTNET_FORCE_REDEPLOY=1` is set, so reruns don't
accidentally orphan previous deploys.

## Running `aztec test` (Task 22)

Use the wrapper:

```bash
./scripts/aztec-test.sh                 # all 5 V2 contracts (~30 s warm)
./scripts/aztec-test.sh kyc_verifier    # single contract
```

By default the script uses the host `aztec` CLI: each contract runs
`aztec test`, which handles compile + TXE + oracle resolver
internally. No docker required. The full suite is **77 tests** across the
5 V2 contracts (kyc_verifier 7, housing_fund 29, governance 16,
protocol_rewards 17, fsft_dex 8) and runs in CI on every push/PR
(`.github/workflows/tests.yml`).

The script compiles each contract **before** staging cross-contract
dependency artifacts. This ordering matters: the `aztec compile` / `aztec
test` wrapper skips compilation when `target/` already holds a `.json`
newer than every source (see `needs_recompile` in the `@aztec/aztec`
CLI), and a staged dependency artifact looks exactly like that — so
staging first would make the wrapper skip building the main contract and
TXE could not find `<pkg>-<Contract>.json`. New cross-contract tests must
register their dep in `stage_cross_contract_deps` (the vendored AIP-20
`Token` is a workspace member, so its artifact is staged from
`contracts/vendor/aztec-standards/target`, not the member dir).

Opt-in legacy docker path: `FS_AZTEC_TEST_DOCKER=1 ./scripts/aztec-test.sh`
spawns TXE inside the pinned `aztecprotocol/aztec:4.3.0` image and runs
`nargo test --oracle-resolver http://127.0.0.1:8080`. Slower (~65 s for
the full suite) but useful for parity checks with CI. NOTE: the docker
path's inline staging only covers `housing_fund`'s KYCVerifier; the new
governance / protocol_rewards / fsft_dex cross-contract tests are staged
only on the host path, so run those via the default (host) path.

If you see `Contract's public bytecode has not been transpiled` from
TXE, the offending artifact was produced by raw `nargo compile` instead
of `aztec compile`. Re-run `aztec compile` (or just `aztec test`, which
recompiles when sources change).

## Adding more `aztec test` coverage

Pattern lives in each contract's `src/test.nr`: a `use crate::Contract;` +
`TestEnvironment::new()` + `env.deploy(...)` + `env.call_public(...)` /
`env.call_private(...)` / `env.view_public(...)` / `env.execute_utility(...)`.
`housing_fund/src/test.nr` is the richest reference (cross-contract deploy of a
real KYCVerifier, public deposit→rent→reinvest E2E). Host nargo runs tests in
~5 s per contract.

**Coverage status (public-path E2Es landed; private-note E2Es still deferred):**

1. ✅ KYCVerifier — issue/revoke happy paths + commitment parity (7 tests).
2. ✅ HousingFund — rent ingestion, ROR, public reinvest E2E (24 tests).
3. ✅ Governance — proposal-create lifecycle + finalize/execute guards (10 tests).
   `cast_vote_private` happy path / double-vote (SingleUseClaim) is the remaining
   PRIVATE E2E — no public entrypoint writes the yes/no tally, so it needs hinted
   KYC + deposit notes.
4. ✅ ProtocolRewards — checkpoint → set_user_epoch_weights (40/40/20 split, real
   FSFT Token) → public `claim` mints, plus emission-schedule + guard tests
   (17 tests). `allocate_reward_private` / `claim_reward_private` (hinted reward
   note + re-claim rejection) is the remaining PRIVATE E2E.
5. ✅ FSFTDex — risk-policy guards, orderbook snapshot (real HousingFund),
   can_trade (real KYCVerifier) (8 tests). `place_order` → match → `cancel_order`
   / `claim` is the remaining PRIVATE E2E (hinted KYC note + token escrow +
   authwit).

## Frontend unit tests (Vitest)

Pure logic modules under `frontend/src/lib` are unit-tested with Vitest (the
only test runner; no DOM/Aztec node needed):

```bash
cd frontend && npm test        # vitest run (also in CI)
cd frontend && npm run test:watch
```

Config: `frontend/vitest.config.ts` (node env, `@/` alias mirrors tsconfig);
tests live in `frontend/src/lib/__tests__/`. Current coverage: `proposalLifecycle`
(status/voting-window/quorum/"Voting ended"), `projectDossier` (slug resolution,
`getProjectDossier` returns `null` when unauthored, `aggregateImpact`,
`modelledRorRent` = the €500K@3%→€1,250/mo example), and an emission **parity
guard** (`rewardsEmissionParity`) asserting `simulationStore` mirrors the
on-chain `protocol_rewards` curve (8M pool / 120 epochs / 13-12-11-10… bps /
40-40-20 split) — keep it green alongside the Noir
`test_epoch_target_follows_emission_schedule` when either side changes.

## Economic model: rent, return & NAV (canonical)

This is the **single source of truth** for how money moves for an FSFT holder. It
supersedes the older "capped-return → affordability-reserve" framing in
[`docs/FUTURE_DEVELOPMENT_PLAN.md`](./docs/FUTURE_DEVELOPMENT_PLAN.md) §4.0 and the
modelled `CAPPED_RETURN_PCT` overlay (see the demo-layer note below).

### Two numbers, kept separate

An FSFT holder has exactly two figures, and the UI must keep them distinct:

1. **Stake / share value (NAV).** What their FSFT is worth as a claim on the
   fund's **capital** — property value (and not-yet-deployed deposit principal).
   In the read layer today `NAV = total_deposits` (property marks land later via
   the valuation oracle, §3.2). **Rent does NOT inflate NAV.**
2. **Rent earnings.** A **separate, claimable income stream** — "monthly
   earnings" / the return on their investment. Paid out as EUR (withdraw) or
   reinvested; it never silently rolls into NAV-per-FSFT.

> Why separate: rent is *income on top of* the capital, not appreciation of it.
> Folding rent into NAV conflates "what my share is worth" with "what I can take
> out." (An earlier commit folded rent into NAV; that is being reversed — see
> [`docs/PHASE1_YIELD_AND_RENT.md`](./docs/PHASE1_YIELD_AND_RENT.md).)

### ROR is the master parameter — rent is cost-based, not market-based

Rent is defined off the property's **acquisition value**, not the open market:

```
annual rent  = ROR × acquisition_value          (ROR e.g. 3% = 300 bps)
monthly rent = annual rent / 12
```

Example: a €500K home at ROR 3% → €15,000/yr → **€1,250/mo**. That full amount
flows to the investor pool. This **is** the "capped return": the investor return
is fixed by the ROR formula, and because that rent is **below market**
(cost-based), the household gets the affordability benefit directly — there is
**no separate "surplus → affordability reserve"** step (the older §4.0 mechanism
is dropped). ROR is a fund/property parameter; the keeper still posts **actual
collected** rent (which may fall short of the ROR target when households underpay
— see risk-pooling below), and the ROR figure drives the *expected/billed* rent.

> **On-chain affordability covenant (Phase 2 / item 1 — landed).** The covenant
> is no longer only modelled in `projectDossier.ts`: it now lives on-chain as a
> *votable, enforced* proposal term. A proposer attaches it once, pre-vote, via
> `Governance.set_proposal_covenant(proposal_id, rent_ceiling_bps, lock_years,
> clawback_bps, target_group)` (proposer-only, once-only, bounds-checked); members
> vote on the proposal including its covenant. The fund pulls it with
> `HousingFund.sync_proposal_covenant(proposal_id)` (keyed by `property_id ==
> proposal_id`), and **`record_rent` rejects rent above the covenant's monthly
> ceiling** (`acquisition_value * rent_ceiling_bps / 10000 / 12`) — so rents stay
> affordable by construction. Enforcement is additive/backward-compatible (no
> synced covenant ⇒ no ceiling). **Follow-ups** (not yet built): the clawback
> *transfer* of above-cap excess to the public partner, lock-expiry (maturity)
> enforcement, the optional `target_group` eligibility gate, and surfacing the
> on-chain covenant in the frontend so its `ModelledChip` comes off. See
> `docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md`.

### One shared pool, pro-rata, risk-pooled

- **All rent from all properties is pooled.** A holder does **not** get the rent
  of "their" house. Every FSFT holder shares the rental income of **all** homes,
  **pro-rata to FSFT** — with the protocol's small-depositor floor still
  over-allocating small savers (`SMALL_POOL_BPS` 30%, the same FIFO+floor
  machinery as proposal distributions).
- **Why pooled:** risk-pooling. If some households are late or default, the whole
  pool dips slightly rather than one investor eating the loss on one house.
  Holders hold a diversified claim on the entire portfolio's rent.

### Withdraw or reinvest — and track which

A holder chooses, via the **Rent earnings** panel on `/portfolio`:

- **Withdraw as cash** — the claimable rent is paid out as EUR
  (`HousingFund.claim_rent` public / `claim_rent_private` private).
- **Reinvest** — the rent re-enters the fund via the **normal deposit route** as
  fresh capital (`HousingFund.reinvest_rent`): NAV grows and the holder compounds
  (a larger deposit → larger future FSFT + rent share).

A per-holder ledger tracks **withdrawn vs reinvested** (`get_rent_withdrawn` /
`get_rent_reinvested`, public path only — private claims are not attributed
on-chain, for privacy). `rentClaimable = earned − withdrawn − reinvested`.

**Status — what is / isn't wired (keep this honest):**
- **Simulation (the default demo): fully working.** Withdraw + Reinvest act on the
  in-memory store (`simClaimRent` / `simReinvestRent`); `/portfolio` shows the
  earned/withdrawn/reinvested/claimable breakdown with both buttons.
- **Live: Withdraw + Reinvest are both wired** — `claim_rent_private` and
  `reinvest_rent_private` (each needs a keeper-opened rent epoch). Withdraw
  (`claim_rent_private`) and the governance **distribution claim**
  (`claim_distribution_private`) now **enumerate all the caller's deposit notes**
  (loop over `get_my_deposit_notes`, skipping already-claimed / zero-share /
  post-snapshot notes via the per-note error guards) so a multi-note depositor
  claims their full share — claiming only the first note used to strand the rest
  (the "still unclaimed" remainder). **Reinvest (`reinvest_rent_private`) is still
  single-note** (claims the caller's first deposit note — a uniform follow-up).
  The live paths are exercised in the docker stack (the default demo runs in
  sim). Note: the governance proposals route reads per-account claimable from
  **public** deposit records, which are empty for `deposit_private` holders, so
  the live UI uses a `hasPrivateDeposits` flag to show "claim to receive your
  private share" instead of a misleading €0. Artifacts in
  `frontend/src/artifacts/` are **gitignored / build-generated** (codegen output,
  tracked via `codegenCache.json`) — there is no committed artifact to refresh; the
  deploy/bootstrap build regenerates them from the contracts (the contract-hash
  change triggers it). Local-live uses the freshly compiled
  `contracts/housing_fund/target/*.json` (the loader prefers it).
- **ROR is surfaced in the dossier from chain.** `get_ror_bps` flows into
  `FundStats.rorBps`; `ReturnsCapPanel` shows the **real** ROR (labelled "on-chain")
  when set, falling back to the modelled `CAPPED_RETURN_PCT` otherwise. The worked
  euro example stays modelled. `scripts/seed-fsft.sh` seeds `set_ror_bps` (3%) +
  `set_acquisition_value` (€500K → €1,250/mo) via `POST /api/fund/ror`; sim defaults
  ROR to 300 bps so the demo shows it without seeding. (`get_expected_monthly_rent`
  is on-chain but not yet rendered — the example uses a modelled acquisition.)

### Frontend rule for this model

Keep it **simple and legible** (the frontend principles below still apply):
present the two numbers plainly — *"Stake (share value): €X"* and *"Rent earnings:
€Y — [Withdraw] [Reinvest]"*. Do not merge them; never show rent as an APY; use an
`InfoDot` for the pooled / pro-rata / risk-pooling explanation rather than a
paragraph. Real on-chain figures are untagged; only genuinely modelled inputs
(e.g. an acquisition value not yet on-chain) carry the `ModelledChip`.

## Frontend design system & app shell

### Run mode: production by default, `FRONTEND_DEV=1` to edit

The docker `frontend` service runs a **production build** (`next build` +
`next start`) by default — routes are pre-compiled, so first-visit page latency
is ~3 ms instead of the 0.4–0.6 s per-route on-demand compile `next dev` pays
(that compile penalty, not the chain, was the old "feels slow"). When EDITING
the frontend and you want hot reload, set `FRONTEND_DEV=1` (e.g.
`FRONTEND_DEV=1 docker compose --profile aztec up -d frontend`). After a code
change in production mode, recreate the container to rebuild:
`docker compose --profile aztec up -d frontend --no-deps --force-recreate`
(one-time ~60 s build at start; healthcheck `start_period` covers it).

The frontend is a **user-facing app, not an admin console**. The north-star
direction lives in [`docs/frontend-redesign-design-doc.md`](./docs/frontend-redesign-design-doc.md)
— read it before any frontend work. Core principle: *affordable-housing finance
first, protocol mechanics second, token mechanics third.* No new dependencies
(no shadcn/lucide/icon libs); build only on the `@theme` tokens in
`frontend/src/app/globals.css`, the primitives in `@/components/ui`, and Plus
Jakarta Sans. Only ever render real on-chain/API data — never invent fields.

### App shell (`@/components/shell`)

There is **no left sidebar**. The only persistent chrome is a single calm
**top bar** (`shell/TopBar.tsx`) over a single full-width `max-w-6xl` content
column (`app/layout.tsx`): brand · primary tabs · "More" disclosure · TrustChip
· runtime (live/sim) chip · wallet. Mobile uses `shell/MobileDrawer.tsx`
(accessible slide-over) + a tab scroll strip. `shell/ShellProvider.tsx` holds
open-state. Privacy is shown as assurance via `shell/TrustChip.tsx` (a compact
worst-of-state summary expanding to the `ui/ProofRail` data).

Navigation tiers live in `frontend/src/lib/nav.ts`: `PRIMARY_ITEMS` (everyday:
Overview, Projects, Portfolio, Invest, Governance) vs `MORE_ACCOUNT_ITEMS`
(Trade, Rewards, Verification) vs `MORE_REFERENCE_ITEMS` (Reference, Explain).
**Trade is never central.** Keep Reference + Explain reachable but demoted.

### Primitives — import from `@/components/ui`

Reuse these; do **not** build per-page chrome or invent type sizes:
`PageHeader`, `Section`, `KpiGrid`/`KpiCard`, `DataTable`, `StatusChip`,
`ProofChip`, `Tabs`, `Stepper`, `FormField`, `Button`, `Alert`, `EmptyState`,
`LoadingSkeleton`/`SkeletonKpi`/`SkeletonRow`, `ActionBar`, `ProofRail`.

- **Type scale** (classes in `globals.css`): `.text-kpi` · `.text-heading` ·
  `.text-label` · `.text-body` · `.text-caption` · `.text-mono`. Don't repeat
  one-off `text-xs uppercase tracking-wide` — use the label class.
- **Progressive disclosure** — advanced is always opt-in. Wrap dense/technical
  detail in `ui/AdvancedDetails`; never put it in the primary flow.
- **Tooltips/help** — use `ui/Tooltip` + `InfoDot` (dependency-free, accessible:
  hover/focus/Escape, `aria-describedby`). Add an `InfoDot` next to a term
  rather than a paragraph of explanation.
- **Status** — `StatusChip` kinds, never color alone. Past-deadline-but-still-
  ACTIVE governance proposals must show "Voting ended" via
  `governanceStatus.displayStatus()`, not the raw on-chain status.
- Font: Plus Jakarta Sans (400/500/600/700), self-hosted via `next/font`.

`SimplePage.tsx` is legacy (only `explain` still uses it) — migrate off it, do
not extend it. Any client page reading `useSearchParams()` must be wrapped in a
`<Suspense>` boundary or the Vercel static build fails.

### Project dossier & the demo layer (FUTURE_DEVELOPMENT_PLAN §9 / D1–D4)

The §9 demo build ("housing first, mechanics second") adds a **modelled
project-finance layer** overlaid on the real on-chain proposal/deed. Read
[`docs/FUTURE_DEVELOPMENT_PLAN.md` §9](./docs/FUTURE_DEVELOPMENT_PLAN.md) and
[`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md) before touching it.

- **The honesty rule (non-negotiable).** Every on-screen number is either
  **verifiably real** (on-chain reads) or **chip-labelled "Modelled for demo"**.
  Never present a modelled number as live — that honesty *is* the pitch to
  housing partners. Use `ui/ModelledChip` (built on `.chip-sim`, the dashed
  low-key variant) next to any modelled figure / section.
- **`frontend/src/lib/projectDossier.ts`** — the modelled metadata (capital
  stack, documented financing gap / `onrendabele top`, affordability covenant,
  milestones, impact, role-gated sensitive rows). It is a **typed sidecar, not
  on-chain** (HousingFund has no covenant/reserve fields). Resolve it with
  `getProjectDossier(proposal)` (keys by proposal id **or** title-slug; returns
  `null` when none is authored — never invent one). `aggregateImpact(proposals)`
  feeds the impact strip; `modelledReturnSplit(pool)` the capped-return display.
  `SMALL_DEPOSITOR_FLOOR_BPS` (3000) mirrors the **real** on-chain `SMALL_POOL_BPS`
  and is surfaced *without* a modelled tag; `CAPPED_RETURN_PCT` (3.5) is a legacy
  modelled overlay — the canonical return model is now **ROR-based** (rent = ROR ×
  acquisition value, fully to investors, no surplus reserve); see the
  *"Economic model: rent, return & NAV"* section above, which the dossier
  return-split display should follow.
- **Where it renders.** D1 dossier = a **"Dossier" tab** on `/fund/[id]`
  (`components/projects/ProjectDetailDossier.tsx`), which becomes the **default
  tab** when a dossier exists (lead with housing); sensitive rows are gated on
  `eligibility.investorRole`. D2 capped-return = `ProjectDetailDossier` +
  `components/projects/ReturnsCapPanel.tsx` (a compact banner also sits on the
  Distribution tab). D4 impact = `components/overview/ImpactStrip.tsx` at the top
  of the Overview. `components/projects/CapitalStack.tsx` is the stacked-bar
  visual. The dossier draws the **modelled↔on-chain bridge** explicitly — the
  proposal amount *represents* the Fair Squares tranche; the two are never merged
  into one euro figure.
- **Seed / demo headroom.** `scripts/seed-fsft.sh` funds a proposal **below**
  total deposits (`PROPOSAL_AMOUNT=20000` of 30000) so the fund shows non-zero
  "Available to deploy", and titles it `Maashaven Wonen — Rotterdam` so the
  dossier resolves. The dossier content is **illustrative** (a representative
  Rotterdam wooncoöperatie), not a real partner's finances.

### Verifying a frontend change without clobbering the running container

The docker `frontend` service serves a **root-owned `.next/`**; never `rm`/build
over it. To typecheck + build safely: `npm run typecheck` (skip `next typegen`
and call `tsc` directly if `.next` is root-owned — it fails to write route
types), and for a full build use the env-gated `distDir`:
`NEXT_DIST_DIR=.next-verify npx next build` then `rm -rf .next-verify`. (Building
with `NEXT_DIST_DIR` set rewrites `next-env.d.ts`/`tsconfig.json` to point at the
verify dir — `git checkout` those two afterward.)

## User-facing product rules (truth, hierarchy, first-use simplicity)

The frontend is a **product a non-crypto person understands in 60 seconds**, not a
protocol demo. These rules are binding for every frontend change; they extend (do
not replace) **The honesty rule** in *Project dossier & the demo layer* above.

### Truth before polish (hard rules)

```
- Never label a value with a source it doesn't have. "Last issuance price",
  "last sale price", and contract fallbacks are NOT "NAV".
- Copy may only claim behavior active in the live system. Idle capital "can be
  parked in a yield source (adapter not active yet)" — never "earns yield"
  (no real yield adapter is active; defi_vault accrues zero).
- Private aggregates that can't be counted publicly render with an honest label
  ("Publicly registered investors", "Private / not publicly countable"), never a
  bare 0 implying nobody is in the fund.
- Local/test runtime is "Demo network · no real funds", never "Live".
- Every modelled value uses <ModelledChip>; every untagged value is backed by the
  exact on-chain/API meaning shown in its label.
```

### Canonical lifecycle vocabulary — reuse everywhere, never the raw enum words

```
GOVERNANCE (a proposal):   Voting open → Voting ended → Approved → Rejected → Funded
PROJECT / PAYOUT (post-Funded):              Funded → Distributing → Fully claimed
Held = an on-chain deed with no distribution opened yet.
```

Source of truth: `lib/proposalLifecycle.ts` `displayStatus()` ALWAYS returns the
canonical governance label (so no caller falls back to a divergent `StatusChip`
default like "Executed"); `components/projects/ProjectStatusChip.tsx` adds the
payout states. Never render a proposal/project status without going through these.
A Vitest guard (`proposalLifecycle.test.ts` → "canonical governance vocabulary")
fails if `displayStatus` ever emits a raw enum word — keep it green.

### First-use simplicity

```
- Design for someone who has never used crypto or investment software.
- One purpose, one next action, ≤3 headline facts per screen.
- Plain language before protocol terms: "Fund Shares (FSFT)" before FSFT;
  "participation rewards" before FSP. Introduce an acronym only when the user
  needs it to complete an action.
- Don't expose the whole architecture through nav. Advanced features live in
  contextual links, More, and progressive disclosure (AdvancedDetails).
- Never repeat an explanation across cards on a screen — link to one canonical
  place (/explain) instead.
- Introductory copy is one sentence; explanatory paragraphs are ≤2 lines before
  disclosure.
- First-time journey: understand the housing project → inspect terms & risks →
  invest → manage the position.
- 60-second test: a user can say what's funded, what they receive, the primary
  risk, and the next action.
```

### Product hierarchy

- Lead with one concrete affordable-housing project and the financing gap it closes.
- Disconnected visitor → lead with project story, impact, trust, one next action.
- Connected investor → lead with their position, claimable actions, one next action.
- **Exactly one primary CTA per screen/state**; secondary actions must not compete.
- Never delete working functionality to simplify — move technical/protocol/demo/
  infrequent features into `AdvancedDetails`, **More**, Reference, or a dedicated route.
- Dev accounts, faucets, raw phases, contract versions, block heights, and debug
  controls never appear in the default user-facing flow.

### Route contracts (one job + one primary action each)

```
/             project/impact overview + personalized next step; ≤3 headline KPIs before disclosure.
/fund         project lifecycle & financing needs; human identity first, on-chain ID second.
/fund/[id]    canonical project dossier & permanent record.
/portfolio    investor source of truth; actionable money first, then holdings/readiness/history.
/invest       one guided deposit flow; each unmet gate links to its resolution.
/governance   decision queue only: decision, deadline, quorum, eligibility, action.
/governance/[id]  ballot, threshold, outcome, execution; link to the dossier, don't duplicate it.
/kyc          verification requirements, expected time, privacy assurance, readiness.
/rewards      participation program, separated from rent income and investment return.
/dex          advanced secondary liquidity; pricing/liquidity risk shown; mechanics collapsed.
/explain      canonical glossary with stable anchors; other routes deep-link terms here.
/reference    technical truth/debug surface; human-readable values first, raw protocol detail second.
```

### Consistency, interaction & mobile

- One canonical project lifecycle + one governance lifecycle; reuse labels, colors,
  state-aware copy everywhere. Human time/status first; raw block numbers are
  secondary/advanced.
- "Fund Shares (FSFT)" for ownership; "FSP participation rewards" for rewards.
- Connect/verify prompts include the action **inline** — never "go elsewhere".
- Destructive actions require confirmation or an undo window.
- Forms: semantic labels, `name`, suitable `autocomplete`, inline errors, focus the
  first invalid field.
- Mobile: **one** primary-nav pattern (a compact bottom nav + More drawer) — never a
  hamburger plus a clipped duplicate tab strip. Important KPI groups may use compact
  2-column tiles. Tabs need a visible overflow affordance; steppers stay compact;
  touch targets ≥44px.

### User-facing definition of done (verify before merging a frontend change)

```
1. A non-crypto user can say what is funded, what gap is closed, what they own, and
   what they can do next.
2. No live/modelled/private value is mislabeled.
3. Each route has one clear job and one primary action.
4. Protocol mechanics remain available without dominating the primary flow.
5. Disconnected, loading, empty, error, connected, and mobile states are all intentional.
```

## Fair Squares brand & design system (canonical)

The app implements the official **Fair Squares design-system bundle** (Claude Design
handoff). Brand tokens live in `frontend/src/app/globals.css`; the re-skin keeps the
shared class names (`.surface`, `.btn-*`, `.text-*`, `.chip-*`) and changes their
definitions, so pages inherit the brand without per-page edits. Assets in
`frontend/public/brand/` (logos, marks, `illustrations/*.png`); Nexa OTFs in
`frontend/src/fonts/`, wired via `next/font/local`.

```
Palette (exact bundle hexes — supersede the old near-values):
  ink/anthracite #231E23 · teal #39A6A3 · magenta #BF1363 · mint #DEEEEA
  paper #FFFFFF · off-white #F7F9F8.  Full teal/magenta/ink 50–900 scales in @theme.
  Usage ~70% white/off-white · 15% anthracite · 10% teal · 5% magenta.
  Teal = everyday accent + PRIMARY CTA fill (.btn-primary). Magenta = ONE highlight
  per view (.btn-highlight, active nav underline). Anthracite = text + dark surfaces.
  Illustration-only hues (lime/olive/yellow) NEVER in core UI.

Type: Nexa (Heavy 700–800 / Black 900) for display + section headings + the wordmark;
  DM Sans (variable) for body. Data KPIs (.text-kpi) stay DM Sans TABULAR — Nexa has
  no tabular figures and would misalign columns. Mono only for code/addresses.
  Eyebrows (.text-label) are tiny uppercase TEAL.

Shape: rounded 16px cards (.surface) with a soft low-opacity anthracite shadow;
  10px inputs; 999px pill buttons; hairline borders. NO gradients, NO glassmorphism,
  NO blueprint-grid/console texture (the old .fs-site-bg/.proto-stamp are removed).
  Mint section bands (.band-mint / .surface-mint) segment the page instead.

Voice: sentence case everywhere; warm, plain-spoken, mission-driven; "people, not
  profit"; "we" for Fair Squares, "you" for the reader; no emoji; no crypto hype.

Icons: the app stays ICON-LIGHT. The bundle defaults to Lucide (CDN) but this repo
  forbids new icon/UI libraries — that is a deliberate, documented deviation. Do NOT
  add Lucide or any icon library.

Illustrations: hand-drawn housing line-art, ONE per view max, as a hero/section
  anchor (e.g. housing-fund.png on the Overview hero). Never wall-to-wall.
```

> **Navigation (done).** Primary nav is the minimal **Home · Projects · Portfolio**
> + a **More** disclosure (`lib/nav.ts`: Governance, Trade, Rewards, Verification,
> Reference, How-it-works are `more-account`/`more-reference`). **Invest is
> contextual** — reached from a project or the Home next-step CTA, not a top-level
> tab. Mobile uses one pattern: a fixed compact **bottom nav** (`shell/BottomNav.tsx`,
> Home/Projects/Portfolio/More) + the `MobileDrawer` for More — the old hamburger +
> clipped tab strip are gone. **Home** (`app/page.tsx`) leads with a featured project
> (`overview/FeaturedProject.tsx`, the Maashaven dossier) for disconnected visitors
> and the investor's position/next-step when connected; ≤3 real headline KPIs, the
> rest behind an "All fund metrics" disclosure.
