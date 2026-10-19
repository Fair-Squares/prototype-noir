# Aztec Project

This file is the canonical agent guide for this repo. [AGENTS.md](./AGENTS.md) is a stub that points here so Codex (and any other tool that reads `AGENTS.md`) gets the same instructions.

## Critical: Use the host `aztec` CLI, not `nargo` directly

This is an Aztec smart contract project on **Aztec v6** (`6.0.0-rc.3`: aztec-nr
from `aztec-labs-eng/aztec-nr`, npm packages under the `@aztec-labs/*` scope,
node image `azteclabs/aztec`). The single version pin is **`.aztec-version`**
(read by `scripts/ci/install-aztec.sh`, the docker test path and CI); keep it in
step with the `tag = "v…"` in every `contracts/**/Nargo.toml`, the
`x-aztec-image` in `docker-compose.yml` and the `@aztec-labs/*` pins in
`frontend/package.json` + `scripts/package.json`. The host CLI is installed at
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

Install / reinstall (needs Node >= 24.12):

```bash
./scripts/ci/install-aztec.sh            # installs the version in .aztec-version
export PATH="$HOME/.aztec/current/bin:$PATH"
```

Confirms with `aztec --version` -> `6.0.0-rc.3`, `aztec-nargo --version` ->
`1.0.0-rc.3`. Do NOT use the bare `bash -i <(curl -sL https://install.aztec.network/<v>)`
one-liner in CI: the frozen per-version installer bundles foundry through the
moving foundryup bootstrap, which now emits symlinked binaries and aborts the
whole install with "expected bundled binary 'forge' missing" (that is what broke
CI for months). `install-aztec.sh` runs the same upstream installer with the
foundry step made best-effort -- compile + TXE never need forge/anvil.

### Noir 1.0 type-complexity cap (why storage is packed into structs)

The v6 `#[aztec]` macro builds one generic self type over the whole `Storage`
struct and Noir 1.0 caps that type at `MAX_TYPE_COMPLEXITY = 100k` nodes in
every PRIVATE function ("Type is too complex"). Each `PublicMutable` field costs
~2 `PrivateContext` expansions and each `Map` ~4, so a contract gets roughly
**75 units** of storage. HousingFund / Governance / ProtocolRewards therefore
keep related scalars in `#[derive(Packable, Eq)]` structs (`FundLinks`,
`FundTotals`, `EpochSnapshot`, `Proposal`, `Listing`, `Epoch`, ...) stored as ONE
`PublicMutable` / one `Map` value each, read-modify-written as a unit. When you
add storage, extend an existing group rather than adding a new top-level field
(each new `Map` costs 4 units; HousingFund sits at ~54). The external ABI is
unaffected by grouping.

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

### Local stack timing on v6 (docker compose, `--profile aztec`)

- The v6 local network runs the deterministic **`AutomineSequencer`** (the
  pre-v6 `AnvilTestWatcher` is gone). It forces anvil into automine itself,
  polls the mempool every 50 ms, builds a single-block checkpoint as soon as a
  tx is pending, warps L1 time to the next slot with cheat codes, publishes to
  L1 in the same step and settles epochs synthetically. There is no wall-clock
  slot wait, so `docker-compose.yml` only needs a bare `anvil` (no
  `--block-time`) plus `P2P_MIN_TX_POOL_AGE_MS=0` (the automine build only picks
  txs older than the p2p min pool age). `SEQ_TX_POLLING_INTERVAL_MS` and
  `SEQ_ATTESTATION_PROPAGATION_TIME` no longer exist / do nothing on v6.
- **Tx statuses** are now `pending -> proposed -> checkpointed -> proven ->
  finalized`. `EmbeddedWallet.send({ from })` resolves at **PROPOSED** (in a
  sequenced L2 block, before the L1 checkpoint) and the PXE anchors reads on the
  proposed tip, so a route's follow-up read sees the new state. The receipt
  `status` field in API responses therefore reads `"proposed"`, not `"mined"`.
- The wallet polls for the receipt every `interval` seconds (SDK default 1 s,
  first poll skipped by one interval). `serverWallet.ts` and the e2e harness set
  it to **0.25 s** (`WALLET_WAIT_INTERVAL_SECONDS` overrides it) -- the same
  cadence upstream uses for in-process nodes.
- **Deploy stage = one SDK process.** `scripts/local-deploy.ts` (run by the
  bootstrap on the image's Node with the image's own `@aztec-labs/*` packages
  symlinked in, so no tsx and no npm install) deploys the 11 instances in
  minter order, wires the links, registers + credentials KYC for test0/1/2,
  drips EUR and records test0's 500 000 EUR private seed deposit: ~60 s,
  versus ~26 separate `aztec-wallet` processes before. Every tx is awaited to
  `checkpointed` (`BOOTSTRAP_WAIT_FOR_STATUS`) because the steps are strictly
  serial, mirroring upstream's own local-network setup. `npm run deploy` in
  `scripts/` runs it standalone against a host network.
- **Local-network test accounts are INITIALIZERLESS on v6.** test0/1/2 are
  genesis-funded, never-deployed Schnorr accounts; only
  `createSchnorrInitializerlessAccount(secret, salt, signingKey)` derives their
  funded addresses. `createSchnorrAccount` yields a different, unfunded address
  and every send fails with "Not enough balance for fee payer". `serverWallet.ts`,
  `local-deploy.ts` and `scripts/e2e/harness.ts` all use the initializerless
  constructor; generated dev accounts and testnet accounts stay regular
  (deployed, sponsored) Schnorr accounts.
- **Validated live on v6:** the full bootstrap (compile skip, codegen, deploy,
  env files, 78 s) and all six `scripts/e2e` private flows pass against a
  6.0.0-rc.3 `aztec start --local-network` (anvil + node + PXE) on a plain
  host, using the exact compose env. Only the docker packaging itself has not
  been exercised. Note `AZTEC_EXIT_DELAY_SECONDS=0` is rejected by the v6 L1
  deploy ("exitDelaySeconds is zero") and kills the node; it was removed from
  the compose file.
- **Compile stage.** nargo is single-threaded (~45 s and ~0.45 GB for
  housing_fund, ~55 s for the vendored token; v6 `bb` transpile + VK generation
  adds only ~1 s per contract, even cold), so the bootstrap runs the nine
  contract compiles as a pool of background jobs, one per core
  (`BOOTSTRAP_COMPILE_JOBS`). The first needed compile runs in the foreground
  to populate nargo's git-dependency cache before concurrent jobs touch it.
  Measured on 4 cores with every artifact removed: the whole compile stage
  (all nine contracts) takes **121 s** in the pool versus **317 s** with
  `BOOTSTRAP_COMPILE_JOBS=1`. Unchanged contracts are skipped
  (`artifact_is_fresh`, which also requires `"transpiled": true`;
  `FS_FORCE_COMPILE=1` rebuilds). The nargo dependency cache lives at
  `$HOME/nargo/github.com/...` (no dot); the compose `nargo-cache` volume
  mounts that path. `FS_BOOTSTRAP_ROOT=<checkout> AZTEC_BIN=aztec` lets the
  compile functions run on a host with the toolchain installed.
- There is **no push/subscription API** for tx completion in v6 aztec.js: the
  only primitives are `send({ wait: NO_WAIT })` (returns the tx hash at once)
  plus `waitForTx(node, txHash, opts)` / `node.getTxReceipt`. The API routes
  await the send and answer when the tx is proposed; a non-blocking
  "submit then poll a status route" flow would be built on those two calls.

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

## Math conventions (integer-only; do NOT import a bignum / fixed-point lib)

FS money math is deliberately **integer `* bps / 10000 [/ 12]`** on `u64`/`u128`
with per-step whole-EUR flooring (rent = `ROR * acquisition_value / 10000 / 12`,
the reward bps ladder, the small-depositor floor). This is **canonical, not a
limitation** — the ROR model is integer-floored by design (the fund keeps the
sub-EUR dust), so there is no precision to recover.

- **Rejected: `noir-bignum` and `wad.nr` (18-decimal fixed point).** Worst-case
  products (≈€500K acquisition, 8M reward pool ⇒ ~1.8e23) sit ~15 orders of
  magnitude below `u128`'s ~3.4e38 ceiling, so arbitrary-width / fixed-point math
  would add constraints for **zero** precision or range benefit. `noir-bignum`'s
  `udiv_mod` is documented EXPENSIVE. **Do not import either** — if a future pass
  is tempted, this is the recorded decision (see
  `docs/AZTEC_ECOSYSTEM_LEARNINGS.md` §2 "Noir math").
- **Overflow posture:** native checked arithmetic already traps on overflow/
  underflow (fail-closed), so do **not** add manual range checks. The only
  sanctioned helper is an optional `#[contract_library_method] mul_div(a, b, c)`
  (widen to `u128`, assert no overflow, then divide) for the two `u64` `value*bps`
  products that could in principle overflow *before* the divide — that is
  mul-div-as-a-pattern, explicitly **not** a library.

## Testnet smoke test

To verify the pinned `@aztec-labs/aztec.js` (6.0.0-rc.3) talks to the public Aztec testnet:

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
internally. No docker required. The full suite is **109 tests** across the
5 V2 contracts (kyc_verifier 12, housing_fund 33, governance 35,
protocol_rewards 18, fsft_dex 11) and runs in CI on every push/PR
(`.github/workflows/tests.yml`). `AZTEC_HOME=/path/to/other/.aztec` selects a
second toolchain install (e.g. to trial the next rc) without re-activating.

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
spawns TXE inside the pinned `azteclabs/aztec:<.aztec-version>` image and runs
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

**Coverage status (public-path E2Es landed in Noir; the private hinted-note E2Es
— once deferred — are now ALL covered by the TS aztec.js harness in `scripts/e2e/`,
see "Private-flow E2E harness" below):**

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

The "remaining PRIVATE E2E" notes above are **done** — but in TypeScript, not
Noir. The hinted-note flows can't be hinted from `TestEnvironment` (it can only
hint a note at a known storage slot, not a contract-created one), so they live as
aztec.js e2e tests against the docker node under `scripts/e2e/` (`npm run e2e:all`):
all six private flows — `claim_reward_private`, `claim_rent_private`,
`reinvest_rent_private`, `cast_vote_private`, `claim_distribution_private`, and the
DEX `place_order`/`cancel_order` — pass from a fresh deploy, each asserting a real
numeric state delta and the single-use guard. See `scripts/e2e/README.md`.

### Private-flow E2E harness (`scripts/e2e/`)

TS aztec.js end-to-end tests for the private hinted-note flows that Noir
`aztec test` structurally cannot cover. Run after `docker compose --profile aztec
up -d` (bootstrap exited 0), on a quiet host:
`cd scripts && env $(grep -v '^#' ../frontend/.env.local | xargs) AZTEC_NODE_URL=http://localhost:8080 npm run e2e:all`.
`harness.ts` holds the shared connection + helpers (`connect`, `loadContract`,
`simValue`, revert-aware `sendOk`/`sendExpectFail`, `depositInProcess`,
`openRentEpoch`, `runProposalToExecuted`, `allDepositNotes`, the `totalClaim` math
mirror) so all six flow files match. Key constraint: a fresh ephemeral PXE can't
rediscover a note minted by another process's PXE, so each flow **creates the
notes it consumes in-process**. These tests also caught + drove the
`HousingFund.set_eur_token` bootstrap fix. Full details in `scripts/e2e/README.md`.

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

1. **Stake / share value.** The fund's NAV is its pooled **capital**
   (`NAV = total_deposits` in the read layer; property marks land later via the
   valuation oracle, §3.2). A holder's FSFT are minted only when the fund buys a
   home, out of their deposit, so shares are valued **at purchase price**:
   `shareValueEur = balance × last_token_price_bps / 10000`
   (`lib/shareValue.ts`, used by the sim and both live routes). **Never** value a
   share as `total_deposits ÷ total_supply` — that prices each share against
   deposits not yet spent on a home (it once showed €1,000 deposited as €61,665
   of shares). **Rent does NOT inflate NAV or share value.**
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
> target_group)` (proposer-only, once-only, bounds-checked); members vote on the
> proposal including its covenant. The fund pulls it with
> `HousingFund.sync_proposal_covenant(proposal_id)` (keyed by `property_id ==
> proposal_id`), and **`record_rent` rejects rent above the covenant's monthly
> ceiling** (`acquisition_value * rent_ceiling_bps / 10000 / 12`) — so rents stay
> affordable by construction. Enforcement is additive/backward-compatible (no
> synced covenant ⇒ no ceiling). **Affordability is enforced by REJECTION, not
> clawback** — because FS rent is fixed by the ROR formula and capped by the
> ceiling, rent can never exceed the agreed amount, so there is *no* clawback /
> recapture path (a deliberate decision — dropped 2026-06; the field was removed
> from the covenant struct, the setter, the API and the UI). **Follow-ups** (not
> yet built): lock-expiry (maturity) enforcement and the optional `target_group`
> eligibility gate. See `docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md`.

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
  `reinvest_rent_private` (each needs a keeper-opened rent epoch **and** the fund's
  `eur_token` wired). The bootstrap now calls `HousingFund.set_eur_token` at deploy
  (`bootstrap-local-network.sh`); it previously did **not**, so `eur_token` stayed
  zero and a live rent claim reverted "eur token mismatch" — caught by the TS e2e
  `scripts/e2e/rent-claim.e2e.ts` (see `scripts/e2e/README.md`). Withdraw
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

> **Stale-plan signpost.** [`docs/FUTURE_DEVELOPMENT_PLAN.md`](./docs/FUTURE_DEVELOPMENT_PLAN.md)
> still frames the dropped *"surplus → affordability-reserve" / capped-return*
> mechanism as the plan, and [`docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md`](./docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md)
> §1c shows never-implemented clawback pseudo-code (it carries its own
> "clawback DROPPED" status banner). Those are kept as **history**; the section
> above (ROR-based: rent = ROR × acquisition value, fully to investors, no surplus
> reserve) is the **canonical** model and supersedes them.

## Privacy model (canonical)

This is the **single source of truth** for what user data is private vs public in
Fair Squares, so an auditor/reader no longer has to grep the contracts for the
known transparency surfaces and demo-only limits. The forward-looking redesign that
closes the residual public leaks (M13/M14/M15 + the public investor list) lives in
[`docs/PRIVACY_V2_REDESIGN_PLAN.md`](./docs/PRIVACY_V2_REDESIGN_PLAN.md) — that is a
**FUTURE plan, not the current architecture**.

### Private by default, dual-mode

Fair Squares is **PRIVATE BY DEFAULT and DUAL-MODE**. For every user-related datum
the everyday flow goes through **encrypted, per-owner private notes spent via
nullifiers** and **private entrypoints**; an OPTIONAL public *"transparency mode"*
path also exists and is **opt-in**. The default frontend flow uses the **private
path everywhere it exists** — the caller's address never crosses the private/public
boundary on those paths.

### Per-datum private (everyday) vs public (transparency-mode) path

| User datum | Private-by-default path (everyday) | Opt-in PUBLIC transparency path |
| --- | --- | --- |
| Deposit amount / fund position | `DepositNote` via `deposit_private` / `withdraw_private` | public `deposit_records` / investor registry / `deposit_tickets` (public deposit path) |
| FSFT fund-share balance | private AIP-20 token balance | public AIP-20 balance (`balance_of_public`) |
| Governance vote | `cast_vote_private` (only the **aggregate** yes/no tally is public; per-voter data + the double-vote guard `vote_claims` SingleUseClaim nullifiers stay owner-siloed) | proposer identity is **intentionally public** (proposals are accountable, attributable) |
| Distribution & rent claims | `claim_distribution_private` / `claim_rent_private` / `reinvest_rent_private` (enumerate the caller's own `DepositNote`s via PXE-scoped reads; **no** per-user attribution written on-chain) | public claim ledgers + `rent_withdrawn_by` / `rent_reinvested_by` (public-path claims only) |
| Participation rewards | `RewardClaimNote` via `claim_reward_private` (exposes nothing per-address) | per-user PUBLIC accounting `user_claimable` / `user_total_claimed` / `user_last_claimed_epoch` + `get_claimable` / `get_user_stats` (**M13**) |
| DEX orders / trades | `OrderOwnerNote`; the on-chain book is **anonymous** (keyed by `seq + owner_tag = poseidon2([secret_owner_key, seq])`, no address in the book; proceeds settle to private `PartialUintNote` commitments) | — |
| KYC / investor status | a hinted `KycCredentialNote` attested privately on `deposit_private` / `cast_vote_private` / private `place_order` (never touches the public maps) | public `is_verified` / `is_investor` confirmed on-chain via `HousingFund.deposit`, `Governance.create_proposal`, `FSFTDex.can_trade`, `ProtocolRewards.claim` (**M15**) |
| Rent earnings | derived from private `DepositNote`s, paid out privately | public-path ledgers (above) |

**Safe public aggregates kept** (counts/totals only, no identities): `verified_count`
/ `get_verified_count`, `total_deposits`, and per-proposal / per-epoch claimed
totals. The `get_investor_count` / `get_investor_at` enumeration covers **public-path
depositors only** — private depositors are invisible there.

### Known, documented limits (current V1 — private-by-default holds; these are the residual leaks)

- **M12 — credential-commitment linkage (accepted).** `deposit_private`,
  `cast_vote_private`, and DEX `place_order` each publish the same **constant**
  handle `poseidon2([owner, nonce])` in their public tails (for revocation
  checking). An on-chain observer can **cluster** one user's deposits + votes +
  orders by matching that field — though `owner` / `nonce` stay private (no address
  crosses the boundary). Full close-out needs private revocation checking (migrate
  `KYCVerifier.revocations` to `DelayedPublicMutable`) or a per-action-domain salt
  `poseidon2([owner, nonce, action_domain])` with per-domain revocation
  registration. Documented in-code.
- **One-bit + amount aggregate leak on private deposits (accepted prototype
  tradeoff).** `deposit_private`'s public tail moves `cum_deposits` by the **exact
  amount** (already public pre-Phase-3) and reveals **one bit** (small vs large) via
  whether `cum_small_deposits` moves. The caller's **address never crosses** the
  boundary. Accepted to keep FIFO small-depositor-floor stamping simple (alternative
  = private FIFO advancement, not implemented). Documented in `housing_fund/main.nr`
  (~lines 19–29).
- **M13 — protocol_rewards per-user PUBLIC reward accounting.** `user_claimable` /
  `user_total_claimed` / `user_last_claimed_epoch` are address-keyed PUBLIC maps;
  `get_claimable(user)` / `get_user_stats(user)` expose per-address reward balance +
  history. This is the transparency-mode claim path; the private path
  (`claim_reward_private` / `RewardClaimNote`) exposes nothing per-address.
  Documented in-code (PRIVACY NOTE M13). Future remediation: move per-user accounting
  onto the private `RewardClaimNote` path so only epoch/aggregate views stay public.
- **M14 — protocol_rewards FSFT-reward eligibility.** `set_user_epoch_weights` reads
  the target's **public** FSFT balance via `balance_of_public(user)`, which (a)
  excludes purely-private FSFT holders unless they unshield (deanonymize) and (b)
  records on-chain that the user holds FSFT. Documented in-code (PRIVACY NOTE M14).
  Future remediation: attest FSFT eligibility privately via a `HintedNote` ownership
  proof (mirroring `Governance.cast_vote_private`).
- **M15 — public KYC status on the public-path KYC checks.** `kyc_verifier`'s
  `verified` / `investor_role` address-keyed PUBLIC maps + `is_verified` /
  `is_investor` views are reached publicly via `HousingFund.deposit`,
  `Governance.create_proposal`, `FSFTDex.can_trade`, `ProtocolRewards.claim`; each
  public call confirms the caller's KYC status on-chain and leaks them into the
  participant set. **TRANSPARENCY-MODE-ONLY** — the everyday PRIVATE paths attest a
  hinted `KycCredentialNote` and never touch these maps/views. The aggregate
  `verified_count` / `get_verified_count` is intentional, safe transparency (count
  only, no identities). Documented in-code (PRIVACY NOTE M15).
- **Public investor enumeration in housing_fund.** `get_investor_count()` /
  `get_investor_at(index)` + `investor_index` / `investor_seen` / `deposit_tickets`
  + `get_user_deposit_ticket(user)` enumerate the **public-path** investor set and
  per-address public deposit amounts. INTENTIONAL transparency-mode for public
  depositors only; private depositors (`deposit_private` / `DepositNote`s) never
  register here. Slated for removal/gating in the V2 redesign
  (`docs/PRIVACY_V2_REDESIGN_PLAN.md`).
- **M16 — server auth model (DEMO-ONLY, hard caveat).** The frontend uses **one
  shared server-side `EmbeddedWallet`/PXE** (`frontend/src/lib/serverWallet.ts`)
  holding the keys for **every** deterministic test account. API routes select the
  acting account purely from **request-supplied params** (`address` /
  `accountIndex`). Action + per-user-read routes **do** validate that `address`
  matches the selected account's address (verified across `/api/rewards/claim`,
  `/api/fund/deposit`, `/api/fund/withdraw`, `/api/governance/vote`,
  `/api/dex/claim`, `/api/dex/cancel`, `/api/fund/rent/claim`,
  `/api/rewards/attest`, `/api/portfolio`, `/api/governance/eligibility`) — but
  *"address matches accountIndex"* is **NOT authentication**: any HTTP caller can
  supply any `(address, accountIndex)` pair, so there is no cryptographic
  requester→account binding. Any caller could therefore act as / read any account's
  private state. **Acceptable for the LOCAL DEMO only**; before any multi-user or
  testnet exposure this MUST get per-session challenge–signature auth (ideally one
  PXE/key set per session). Fully documented in the `serverWallet.ts` M16 comment
  block.
  - **M16 parity gap (flagged for human review).** `/api/kyc/status` GET is the one
    user-read route that does **not** follow the address-match pattern: it has no
    `accountIndex` param and always simulates from `getTestAccount(0)` (admin),
    reading `from: userAddress` (the queried address's own PXE note scope). It still
    returns the **queried** address's data (KYC/investor/eligibility), so the same
    demo-only posture applies. Bringing it to parity (add `accountIndex` + an
    address-match guard) is **left flagged for human review** because it needs a
    cross-cutting client change (`fetchKYCProfile` in `contracts.ts` + all callers
    currently send only `address`). Covered by the M16 demo-only caveat.
  - **Runtime account creation (DEMO-ONLY).** Beyond the deterministic test0/1/2,
    the UI's "Generate dev account" now deploys a **real** account in live mode via
    `POST /api/accounts/create` → `serverWallet.createGeneratedAccount()`: it
    creates + deploys a Schnorr account whose fees are paid by the canonical
    **SponsoredFPC** (vendored artifact `frontend/src/lib/sponsoredFpcArtifact.json`,
    derived at salt=0), registers it in the shared PXE, and appends it to the
    in-memory accounts list at index ≥1000 (also surfaced by `GET /api/accounts`,
    aliased `dev-N`). Fees are sponsored **only for generated addresses** via a
    patched `completeFeeOptions` that injects the SponsoredFPC as the wallet-level
    `walletFeePaymentMethod` fallback (test accounts still self-pay; no route
    changes). Such accounts can verify KYC, deposit, vote, and trade like a test
    account. **They are EPHEMERAL** — held only in the server PXE's memory, so a
    frontend restart forgets them (the client reconciles stale localStorage entries
    against `/api/accounts` in live mode). The shared PXE now holds these keys too,
    so the M16 demo-only auth caveat extends to them. Creation is **capped** at
    `FS_MAX_GENERATED_ACCOUNTS` (default 25) per server lifetime — the endpoint is
    unauthenticated, so without a cap an anonymous caller could loop it to drain
    the SponsoredFPC quota / grow server memory. NOTE: `/api/kyc/register`'s
    dev-mode shortcut is gated on `!isLiveModeEnabled()` (it previously fired on
    `NEXT_PUBLIC_DEV_MODE=true`, which the live stack sets, so it wrote a sim flag
    and never issued the on-chain credential while `/api/kyc/status` read the chain).
    In live mode `/api/kyc/register` now **fails the request (500)** when the
    private `issue_credential` tail throws, instead of reporting `verified: true`
    with a swallowed `credentialError` — the private credential is what every
    everyday private flow attests, and `register_kyc` is idempotent so a retry is
    safe. Similarly, `/api/zkpassport/request` **fails closed** in production: an
    SDK error returns a 502 and never substitutes the auto-approving `dev://`
    bypass (that bypass is issued only on the explicit simulation/dev branch).

### Confirmed-correct privacy postures (do NOT "fix" these by mistake)

- `cast_vote_private` publishes **only** aggregate yes/no tallies — never per-voter
  data; `vote_claims` are owner-siloed `SingleUseClaim` nullifiers (private
  double-vote guard).
- The DEX order book is **anonymous** (keyed by `seq + owner_tag`, no address ever in
  the book) and claims pay to private `PartialUintNote` commitments.
- `rent_withdrawn_by` / `rent_reinvested_by` ledgers are **PUBLIC-PATH-ONLY**;
  `claim_rent_private` / `reinvest_rent_private` intentionally skip per-user
  attribution for privacy.
- `KYCVerifier.revocations` are keyed by **credential commitment (hash), not
  address** — which makes admin revocation a deliberate **TWO-SURFACE operation**:
  `revoke_kyc(user)` clears only the public maps, and the private credential stays
  valid until `revoke_credential(commitment)` is ALSO called (the verifier keeps
  the issuance `(owner, nonce)` off-chain to compute it). Do NOT "fix" this with
  an on-chain user→commitment lookup: that would publicly link addresses to the
  M12 credential handle and deanonymize every private action carrying it.
  Likewise `allocate_reward_private` deliberately has **no once-per-(recipient,
  epoch) guard** — a public guard key derived from the recipient is brute-forceable
  over the address space; double allocation is an admin-trust concern bounded by
  the 8M pool cap. Both documented in-code.
- `get_my_deposit_notes` / `get_my_kyc_credentials` / `get_deposit_cursor` are
  owner-scoped PXE reads or global params (safe).
- `defi_vault` is **intentionally deprecated/dormant**: deployed + wired for
  backward-compat but NOT on any live deposit/claim/rent path, has no per-user state,
  and accrues **zero** yield. The frontend must never claim idle capital *"earns
  yield"* (honesty rule) — only *"can be parked in a yield source (adapter not active
  yet)"* (already reflected in copy).

### Frontend privacy labeling (already honest — keep green)

The user-facing copy is verified honest and must stay so: *"Publicly registered
investors"* floor-count hint (`FundHealthKpis` / `FundParticipationKpis`),
`VotePanel` / `VotesTab` *"Your ballot stays private — only running totals are
public"*, DEX *"who posted each order is not [public]"*, KYC *"your documents/
positions stay private"*, invest *"receive a private position"*. No deanonymization,
no bare-0-implying-empty-fund, no mislabeled live/modelled values.

### Build-generated artifacts note

`frontend/src/artifacts/` is **gitignored, build-generated, and root-owned** (docker
writes it). It may contain **stale unused** codegen wrappers (`DeFiVault.ts`,
`NFT.ts` — zero imports) and unused cross-contract JSONs (`defi_vault-DeFiVault.json`,
`fsft_dex-HousingFund.json`, `protocol_rewards-Token.json`, `fund_token-FundToken.json`,
etc.) left from earlier phases. These are **cosmetic clutter only** — do **NOT**
manually `rm` them (root-owned + regenerated from the contracts on deploy). `Dripper`
IS used (via `dripper-Dripper.json` in `/api/fund/tokens`).

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
Home, Homes, Portfolio) vs `MORE_ACCOUNT_ITEMS` (Votes, Secondary market,
Verification) vs `MORE_REFERENCE_ITEMS` (About Fair Squares — /learn).
**The secondary market is never central.** Keep About/parameters reachable but
demoted; /invest, /rewards, /explain and /reference redirect (next.config.ts).

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
- Fonts: DM Sans (body, variable) + Nexa (display), self-hosted via `next/font`
  — see the brand section below. (An earlier revision said Plus Jakarta Sans;
  the code moved on.)
- **Lexicon (UX overhaul)** — user-facing labels come from `lib/lexicon.ts`
  (tiered vocabulary per `docs/UX_FINAL_SIMPLIFICATION_PLAN.md` §1). Tier-3
  protocol-internal terms (epoch, bps, shield, escrow, attest, AIP-*, contract
  function names, block heights) are BANNED from primary UI and enforced by the
  Vitest guard `lib/__tests__/lexicon.test.ts` (empty ratchet baseline — keep it
  empty). Sanctioned Tier-3 surfaces: `components/about/ParametersPanel.tsx` (+
  `shell/BlockTicker.tsx`) and `components/projects/ProjectDetailProofs.tsx`.
- **Formatting** — `lib/format.ts` is the canonical formatting home
  (formatEUR/formatEURDecimals/formatFSFT re-exported by `contracts.ts` for old
  call sites, plus count/pct/bps/date/relative helpers). Never render bps —
  convert with `formatPctFromBps` at the edge.
- **Session activity** — `lib/sessionActivity.ts` records user actions for the
  Portfolio "Activity" list (session-only; the protocol exposes no per-account
  historical feed by design — keep the honest note).
- **Keeper actions are role-gated** — "Record result" / "Deploy capital & open
  payout" render only for `activeAccount.isAdmin` (UI gating, M16 caveat);
  ordinary investors get status alerts instead.

`SimplePage.tsx` was a legacy page wrapper; it has been **deleted** and `/explain`
no longer uses it (`explain/page.tsx` imports only `next/link` + `@/components/ui`).
Build pages on the `@/components/ui` primitives — do not reintroduce a per-page
wrapper. Any client page reading `useSearchParams()` must be wrapped in a
`<Suspense>` boundary or the Vercel static build fails.

### Guided demo (`/demo`) — the simplest end-to-end flow

`app/demo/page.tsx` → `components/demo/DemoTour.tsx` walks ONE persona (Sofie =
sim account test4, unverified at seed) through verify → invest → vote → own →
earn on the featured Maashaven proposal (id 0), one primary action per screen.
The stage is derived, never stored: `lib/demoJourney.ts` `deriveDemoStage(snapshot)`
over `GET /api/demo` (`simGetDemoSnapshot`). User steps go through the ordinary
API routes; the two steps that stand in for time/the keeper (`fund_home` = close
vote + finalize + execute + sync covenant + open payout, `collect_rent` = one
month of ROR rent) live in `simulationStore.ts` (`simDemoCloseVoteAndFund`,
`simDemoCollectRent`) and carry a "Demo shortcut" chip. `simResetDemo` reseeds
the store (seeded votes are open for a day — a short window closed every vote on
the public demo minutes after each server cold start). `/api/demo` is **simulation-only
(403 when `AZTEC_LIVE=true`)** — never add a live branch. `npm run demo` (in
`frontend/`) builds + serves sim mode. Tests: `lib/__tests__/demoJourney.test.ts`
(stage table + full walk against the real store).

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
PROJECT / PAYOUT (post-Funded):              Funded → Paying out → Fully paid
Held = an on-chain deed with no payout opened yet.
```

Source of truth: `lib/proposalLifecycle.ts` `displayStatus()` ALWAYS returns the
canonical governance label (so no caller falls back to a divergent `StatusChip`
default like "Executed"); the payout labels are the exported `PAYOUT_LABELS`
("Paying out" / "Fully paid" — the earlier "Distributing" / "Fully claimed" are
RETIRED), consumed by `components/projects/ProjectStatusChip.tsx` and the
overview previews. Never render a proposal/project status without going through
these. Vitest guards (`proposalLifecycle.test.ts` → "canonical governance
vocabulary" + the payout-labels test) fail on raw enum words or retired payout
words — keep them green. User-facing copy says "payout", never "distribution".

Deadline units: live proposals carry **block** deadlines; sim proposals carry
**unix-seconds** deadlines and are tagged `deadlineKind: "timestamp"` by the
proposals route. `votingWindowFor` branches on that tag (wall-clock compare, so
sim voting windows actually close and the Finalise flow works in the default
demo) and every surface renders the deadline via `window.closesAtLabel` /
`window.remainingLabel` — never `deadlineBlock.toLocaleString()` directly, which
would print a unix timestamp as a block height in sim.

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

> **Navigation (done — updated by the UX overhaul).** Primary nav is the minimal
> **Home · Homes · Portfolio** + a **More** disclosure (`lib/nav.ts`: **Votes**
> (/governance), **Secondary market** (/dex), Verification are `more-account`;
> **About Fair Squares** (/learn — mission, how-it-works, and the sanctioned
> "Parameters & transparency" technical panel) is the one `more-reference` door).
> `/invest`, `/rewards`, `/explain`, `/reference` redirect (next.config.ts);
> deposit lives on `/portfolio#deposit`. Mobile uses one pattern: a fixed compact
> **bottom nav** (`shell/BottomNav.tsx`) + the `MobileDrawer` for More. **Home**
> (`app/page.tsx`) leads with the finance-plus-outcome one-liner (real on-chain
> ROR when set) + the ImpactStrip for disconnected visitors, and the journey
> stepper/position snapshot when connected; ≤3 real headline KPIs, the rest
> behind the "Fund facts" disclosure (raw protocol parameters live on
> /learn#parameters, not Home).
