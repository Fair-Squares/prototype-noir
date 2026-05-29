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
internally. No docker required.

Opt-in legacy docker path: `FS_AZTEC_TEST_DOCKER=1 ./scripts/aztec-test.sh`
spawns TXE inside the pinned `aztecprotocol/aztec:4.3.0` image and runs
`nargo test --oracle-resolver http://127.0.0.1:8080`. Slower (~65 s for
the full suite) but useful for parity checks with CI.

If you see `Contract's public bytecode has not been transpiled` from
TXE, the offending artifact was produced by raw `nargo compile` instead
of `aztec compile`. Re-run `aztec compile` (or just `aztec test`, which
recompiles when sources change).

## Adding more `aztec test` coverage

Pattern lives in `noir-projects/noir-contracts/contracts/test/public_immutable_contract/src/main.nr` in the aztec-packages clone: a `mod tests { ... }` block inside the same file with `TestEnvironment::new()` + `env.deploy(...)` + `env.call_public(...)` / `env.call_private(...)`. Host nargo runs tests in ~5 s per contract. The order to add:

1. KYCVerifier — issue → owner-can-prove-existence happy path; revoke → existence still proves but `is_credential_revoked` flips true.
2. HousingFund — deposit_private → DepositNote present in caller's set; total_deposits aggregate bumps.
3. Governance — cast_vote_private happy path; double-vote rejected (SingleUseClaim).
4. ProtocolRewards — allocate_reward_private → RewardClaimNote present; claim_reward_private consumes and re-claim rejected.
5. FSFTDex — place_order_private → commitment OPEN; cancel_order_private flips to CANCELLED.

## Frontend design system & app shell

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
