# Private-flow E2E harness (W3a)

TypeScript aztec.js end-to-end tests for the contracts' **private hinted-note**
flows, run against the **running docker local-network** node. All six private
flows are covered and pass from a fresh deploy via `npm run e2e:all`.

## Why this exists (and why it isn't a Noir `aztec test`)

The private entrypoints (`claim_reward_private`, `claim_rent_private`,
`reinvest_rent_private`, `cast_vote_private`, `claim_distribution_private`, the
DEX `place_order`/`cancel_order`) take a `HintedNote<…>` — an unconstrained hint
proving a **contract-created** note exists in the note-hash tree. Noir's
`TestEnvironment` can only hint a note at a *known storage slot* (the `aztec-nr`
`history/test.nr` MockNote pattern); it has no ergonomic way to hint a note an
*emitting contract* created (a reward note, a deposit note, a KYC credential).
Upstream Aztec covers exactly this shape (`claim_contract`, `crowdfunding`) only
via a **TS aztec.js e2e**, where the test reads the note's hint from a
`get_my_*_notes` utility (`.simulate({ from })` → `storage[i]`) and passes it
straight into the private consumer — **no manual `packAsHintedNote`**. See
`docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md` → Workstream 3a.

## Prerequisites

1. The docker stack is up and **`aztec-bootstrap` has exited 0**:
   ```bash
   docker compose --profile aztec up -d
   docker compose ps -a            # wait for aztec-bootstrap -> Exited (0)
   ```
2. **Quiet host** — do NOT run a host-side `aztec compile` / `aztec test` while
   the stack is bootstrapping. The repo is bind-mounted into the bootstrap
   container, so concurrent writes to the per-contract target dirs truncate
   artifacts (see CLAUDE.md "Docker full-stack bind-mount race"). A *read-only*
   node test (which these are) is safe **after** bootstrap completes. The harness
   loads artifacts from `frontend/src/artifacts/` (build-generated), not the
   racing target dir.
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
    npm run e2e:all   # or one flow: e2e:rewards | e2e:rent | e2e:reinvest | e2e:vote | e2e:distribution | e2e:dex
```

Each flow prints `[<tag>] PASS -- …` and exits 0; any failed assertion or
reverted tx exits non-zero. `e2e:all` runs all six in sequence (one PXE at a
time — concurrent runs would race on nonces/shared state).

> Re-runs against a **long-lived** node accumulate state (epochs, proposals,
> notes). The flows self-pick fresh indices where they can (rewards auto-scans
> for an un-opened epoch; proposal ids derive from the live count) and page over
> `get_my_*_notes` past the 10-note `MAX_NOTES_PER_PAGE` cap. For rent-based
> flows, bump `RENT_EPOCH` on re-run, or just reset the stack for a clean slate.

### Knobs (env)

| var | default | flow | meaning |
|---|---|---|---|
| `AZTEC_NODE_URL` | `http://localhost:8080` | all | the docker node RPC (host port) |
| `REWARD_EPOCH` | `0` | rewards | start of the upward scan for an un-opened epoch |
| `REWARD_EMISSION` / `REWARD_AMOUNT` | `1000` / `100` | rewards | epoch emission (≤ target) / units allocated+claimed |
| `RENT_EPOCH` | `0` (rent), `5` (reinvest) | rent, reinvest | rent epoch to open; bump on re-run (re-open rejected) |
| `RENT_AMOUNT` | `1000` | rent, reinvest | rent recorded+distributed (under property 0's covenant ceiling) |
| `VOTE_PROPOSAL_AMOUNT` / `VOTE_DESC_HASH` | `1000` / `1` | vote | the in-process proposal's amount / desc hash (id auto-derived) |
| `DISTRIBUTION_AMOUNT` | `5000` | distribution | the executed proposal's distribution pool |
| `DEX_DIST_AMOUNT` / `DEX_SELL_AMOUNT` | `1000` / `50` | dex | FSFT minted via the distribution / SELL size (capped to minted) |
| `DEX_PRICE_BPS` / `DEX_TTL_BLOCKS` | `10000` / `60` | dex | SELL price (par=1.0) / order ttl (< max_ttl 120) |

## Coverage (all six private hinted-note flows)

| script | flow | hints consumed | asserts | single-use guard |
|---|---|---|---|---|
| `e2e:rewards` | `allocate_reward_private` → `claim_reward_private` | reward note (same-contract) | `total_claimed` += amount, private token += amount | duplicate nullifier on re-claim |
| `e2e:rent` | `deposit_private` → `claim_rent_private` | KYC (x-contract) → DepositNote | private EUR += `claimed_total` | per-`(note,epoch)` on re-claim |
| `e2e:reinvest` | `deposit_private` → `reinvest_rent_private` | KYC → DepositNote | new DepositNote +1, `claimed_total` + `total_deposits` += share | per-`(note,epoch)` on re-reinvest |
| `e2e:vote` | `deposit_private` → `cast_vote_private` | KYC + DepositNote (both x-contract) | `yes_votes` += 1 | per-`(proposal,voter)` on re-vote |
| `e2e:distribution` | full gov lifecycle → `claim_distribution_private` | KYC → DepositNote | private FSFT += share == `claimed_total` Δ | per-`(note,proposal)` on re-claim |
| `e2e:dex` | distribution → `place_order` → `cancel_order` | KYC (x-contract) + self-minted OrderOwnerNote + escrow authwit | FSFT escrowed then refunded to claimable | "order not cancellable" on re-cancel |

Every flow is **self-contained** (mints the notes it consumes in this run),
asserts a **real numeric state delta** (never just "no error"), and asserts the
**single-use guard fires** on a repeat.

### Shared harness (`harness.ts`)

Connection + helpers every flow reuses, so the files match:
- `connect()` / `loadContract()` — ephemeral PXE + the 3 schnorr accounts; node-instance registration.
- `simValue()` — tolerant 4.3.0 `simulate()` unwrap; `sendOk()` / `sendExpectFail()` — revert-aware sends (a default `send()` resolves even on a post-mining revert).
- `kycHint()`, `depositCursor()`, `depositInProcess()`, `allDepositNotes()` (pages past the 10-note cap), `openRentEpoch()`, `advanceBlocks()`, `runProposalToExecuted()` (create → vote ×quorum → finalize → execute → open_distribution).
- `fifoShare()` / `smallShare()` / `totalClaim()` — a TS mirror of the on-chain allocation math, so claims assert the **exact** predicted share.

### Note on PXE note discovery
A fresh ephemeral PXE rediscovers the bootstrap **KYC credential**
(`get_my_kyc_credentials` → 1) but NOT a **DepositNote/OrderOwnerNote/reward
note** minted by another process's PXE, even though they're `ONCHAIN_CONSTRAINED`.
So every flow **creates the notes it consumes in-process** (via `deposit_private`
/ `place_order` / `allocate_reward_private`) rather than reading another PXE's
notes — the self-contained pattern throughout.
