# Private-flow E2E harness (W3a)

TypeScript aztec.js end-to-end tests for the contracts' **private hinted-note**
flows, run against the **running docker local-network** node.

## Why this exists (and why it isn't a Noir `aztec test`)

The private entrypoints (`claim_reward_private`, `claim_distribution_private`,
`cast_vote_private`, the DEX `place_order`/`claim`) take a `HintedNote<…>` — an
unconstrained hint proving a **contract-created** note exists in the note-hash
tree. Noir's `TestEnvironment` can only hint a note at a *known storage slot*
(the `aztec-nr` `history/test.nr` MockNote pattern); it has no ergonomic way to
hint a note an *emitting contract* created (a reward note, a deposit note, a KYC
credential). Upstream Aztec covers exactly this shape (`claim_contract`,
`crowdfunding`) only via a **TS aztec.js e2e**, where the test reads the note's
hint from a `get_my_*_notes` utility (`.simulate({ from })` → `storage[i]`) and
passes it straight into the private consumer — **no manual `packAsHintedNote`**.
See `docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md` → Workstream 3a.

## Prerequisites

1. The docker stack is up and **`aztec-bootstrap` has exited 0**:
   ```bash
   docker compose --profile aztec up -d
   docker compose ps -a            # wait for aztec-bootstrap -> Exited (0)
   ```
2. **Quiet host** — do NOT run a host-side `aztec compile` / `aztec test` while
   the stack is bootstrapping. The repo is bind-mounted into the bootstrap
   container, so concurrent writes to `contracts/*/target` truncate artifacts
   (see CLAUDE.md "Docker full-stack bind-mount race"). A *read-only* node test
   (which these are) is safe **after** bootstrap completes. The harness loads
   artifacts from `frontend/src/artifacts/` (build-generated), not the racing
   `target/` dir.
3. Deps are already declared in `scripts/package.json`
   (`@aztec/{aztec.js,accounts,wallets}@4.3.0`, `tsx`). Run `npm install` in
   `scripts/` once if `node_modules` is absent.

## Running

The harness reads deployed addresses from `NEXT_PUBLIC_*_ADDRESS` env vars,
which `bootstrap-local-network.sh` writes to `frontend/.env.local`. Inject them:

```bash
cd scripts
env $(grep -v '^#' ../frontend/.env.local | xargs) \
    AZTEC_NODE_URL=http://localhost:8080 \
    npm run e2e:rewards
```

A green run prints `[e2e:rewards] PASS …` and exits 0; any failed assertion or
reverted tx exits non-zero.

### Knobs (env)

| var | default | meaning |
|---|---|---|
| `AZTEC_NODE_URL` | `http://localhost:8080` | the docker node RPC (host port) |
| `REWARD_EPOCH` | `0` | epoch to checkpoint+allocate; bump for re-runs against a long-lived stack (no double-checkpoint guard) |
| `REWARD_EMISSION` | `1000` | epoch emission (must be ≤ `epoch_emission_target(8M, epoch)`) |
| `REWARD_AMOUNT` | `100` | reward units to allocate then claim |

> The test does its **own** `checkpoint_epoch` + `allocate_reward_private` —
> the bootstrap does not open any epoch, so this keeps the flow self-contained
> on the one contract.

## Coverage / roadmap

Implemented:
- **`rewards-claim.e2e.ts`** — `allocate_reward_private` → `claim_reward_private`
  (mint to private balance) + double-claim rejection (SingleUseClaim).

Next, in ascending setup cost (see the PHASE2 plan's ranking):
2. `housing_fund` `claim_distribution_private` (same-contract DepositNote; needs
   a KYC note → `deposit_private` → an executed-proposal distribution).
3. `housing_fund` `reinvest_rent_private` (same, + an opened rent epoch).
4. `governance` `cast_vote_private` (TWO cross-contract hints: KYC + deposit).
5. `fsft_dex` `place_order`/`claim` (cross-contract KYC hint + token escrow +
   authwit + two funded traders).

`harness.ts` provides the shared connection (`connect`, `loadContract`),
the simulate-unwrap (`simValue`), and revert-aware send helpers (`sendOk`,
`sendExpectFail`) for all of the above.
