# Fair Squares — Decentralized Affordable Housing Fund

A privacy-first housing investment fund built on [Aztec Network](https://aztec.network), using zero-knowledge proofs to protect investor privacy while keeping fund operations fully auditable on-chain.

> **Hackathon prototype** — Aztec devnet v4, local network only, not production-ready.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Operating the Stack](#operating-the-stack)
4. [Frontend Architecture](#frontend-architecture)
5. [Wallet & Account Model](#wallet--account-model)
6. [Contracts Reference](#contracts-reference)
7. [Development Guide](#development-guide)
8. [Changelog Workflow](#changelog-workflow)
9. [Troubleshooting](#troubleshooting)
10. [Project Structure](#project-structure)

---

## Quick Start

### Full stack (Aztec network + contracts + frontend)

```bash
git clone https://github.com/Fair-Squares/prototype-noir.git
cd prototype-noir
docker compose --profile aztec up
```

Open **http://localhost:3000**

Startup sequence (first run ~4 min on 4 cores; re-runs with unchanged
contracts skip the compile step entirely):

| Step | Time | What happens |
|------|------|-------------|
| Anvil (L1) | ~5 s | Local Ethereum chain on port 8545 (automine; the node's AutomineSequencer drives L1 time) |
| Aztec node | ~30 s | Deploys L1 contracts, starts PXE + sequencer on port 8080 |
| Bootstrap: compile | ~2 min cold | Compiles 9 Noir contracts in parallel (one nargo job per core, `BOOTSTRAP_COMPILE_JOBS`); skipped when sources are unchanged |
| Bootstrap: deploy | ~1-2 min | Deploys and wires the contracts (~26 serial transactions via `aztec-wallet`) |
| Frontend | ~60 s | Production `next build`, then serves on port 3000 with contract addresses in env |

### Simulation mode (no Aztec needed)

```bash
docker compose --profile sim up
```

Instant startup — in-memory simulation engine, no blockchain required.
Good for UI work and demos.

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                     User (Browser)                        │
│  BrowserEmbeddedWallet  ←→  Aztec PXE (WASM, in-browser) │
└───────────────────┬──────────────────────────────────────┘
                    │ REST API calls
┌───────────────────▼──────────────────────────────────────┐
│              Next.js Frontend  (port 3000)                │
│  Pages: Dashboard | Fund | Invest | Trade | Governance | Rewards | Portfolio | KYC │
│  API Routes: /api/fund/* | /api/governance/* | /api/rewards/* | /api/kyc/* │
│  Mode: simulation (default) or live (AZTEC_LIVE=true)     │
└───────────────────┬──────────────────────────────────────┘
                    │ AztecNode JSON-RPC
┌───────────────────▼──────────────────────────────────────┐
│              Aztec Node  (port 8080)                      │
│  - PXE (Private eXecution Environment)                    │
│  - AutomineSequencer (a block per pending tx, no slot wait)│
│  - P2P + Archive                                          │
└───────────────────┬──────────────────────────────────────┘
                    │ L1 rollup
┌───────────────────▼──────────────────────────────────────┐
│              Anvil  (port 8545)                           │
│  Local Ethereum L1 — Rollup + Inbox + Outbox contracts    │
└──────────────────────────────────────────────────────────┘
```

### Privacy Model

| What | Visibility |
|------|-----------|
| Who invested | **Private** — only you know |
| How much you invested | **Private** — only you know |
| Total fund size | Public |
| NAV / estimated FSFT price inputs | Public (contract totals + FSFT supply) |
| Total yield | Public |
| Governance votes | Public results, private voting (planned) |
| Private FSFT eligibility proof | Public boolean result, private balance stays hidden |
| KYC status | Public on-chain, document details stay private via zkPassport |

Private-holder proof model (today):
- A private contract call checks your private FSFT balance.
- The chain stores only a yes/no eligibility flag (`has_private_holder_proof`).
- The actual private FSFT amount is not published.

Recursive-verification model (v3.1 rollout path):
- `FundToken.attest_private_holder_recursive(...)` verifies a recursive proof before setting private-holder eligibility.
- `HousingFund.record_asset_sale_recursive(...)` verifies a recursive proof before writing valuation snapshot fields.
- `ProtocolRewards.set_user_epoch_weights_recursive(...)` verifies a recursive proof before writing per-user epoch weights.

> **Status caveat:** this is a *rollout path*, not a delivered guarantee. The
> demo circuits in `proofs/recursive/*` only check input shape (see "What each
> demo proof actually checks" below), so the verification wiring above does not
> yet establish the correctness/eligibility properties it is meant to. The
> "Why this matters" benefits below describe the intended end state.

Why this matters (intended end state, once the circuits are hardened):
- Private values stay private, but correctness can still be verified on-chain.
- Users can trust eligibility and valuation updates without trusting a backend operator.
- The UI can show whether a recursive verifier key is configured for each proof path.

---

## Operating the Stack

### Starting

```bash
# Full Aztec stack
docker compose --profile aztec up -d        # detached
docker compose --profile aztec up           # attached (see logs live)

# Simulation only
docker compose --profile sim up -d
```

### Stopping

```bash
docker compose --profile aztec down         # stops containers, keeps volumes
docker compose --profile aztec down -v      # stops AND deletes all data (full reset)
```

> ⚠️ **Never restart Anvil independently.** Anvil holds the L1 state that the
> Aztec node depends on. Restarting only Anvil invalidates all deployed L1
> contracts and breaks the L2 node. Always restart the full stack:
> ```bash
> docker compose --profile aztec down && docker compose --profile aztec up
> ```

### Viewing Logs

```bash
# All services
docker compose --profile aztec logs -f

# Individual services
docker logs -f fair-squares-noir-aztec-1           # Aztec node (sequencer output)
docker logs -f fair-squares-noir-anvil-1           # L1 chain
docker logs -f fair-squares-noir-aztec-bootstrap-1 # Contract deployment
docker logs -f fair-squares-noir-frontend-1        # Next.js
```

### Service Status

```bash
docker compose --profile aztec ps -a
```

Expected healthy state:

```
NAME                                  STATUS
fair-squares-noir-anvil-1             Up (healthy)
fair-squares-noir-aztec-1             Up (healthy)
fair-squares-noir-aztec-bootstrap-1   Exited (0)    ← exit 0 = success
fair-squares-noir-frontend-1          Up
```

### Checking Deployed Contract Addresses

```bash
# From the shared volume (written by bootstrap)
docker exec fair-squares-noir-frontend-1 cat /app/.env.local

# Or read the volume directly
docker run --rm -v fair-squares-noir_contract-env:/out \
  alpine cat /out/.env.contracts
```

### Checking the Aztec Node

```bash
# Node info (version, L1 contracts, block height)
curl -s http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","id":1}' | jq .result.nodeVersion

# Current block number
curl -s http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"node_getBlockNumber","id":1}' | jq .result
```

### Checking the L1 (Anvil)

```bash
# Current L1 block
cast block-number --rpc-url http://localhost:8545

# Rollup contract address (set during aztec node startup)
curl -s http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","id":1}' \
  | jq '.result.l1ContractAddresses.rollupAddress'
```

### Redeploying Contracts (Without Full Restart)

If contracts need to be redeployed (e.g., after a code change):

```bash
# Stop and remove the bootstrap container + contract volume
docker rm -f fair-squares-noir-aztec-bootstrap-1
docker volume rm fair-squares-noir_contract-env

# Re-run bootstrap
docker compose --profile aztec up aztec-bootstrap
# Wait for exit 0, then restart frontend
docker compose --profile aztec restart frontend
```

---

### Recursive Verification Configuration (Optional)

You can keep default behavior or enable stricter recursive-proof flows.

Set these env vars before bootstrap:

```bash
FUND_TOKEN_PRIVATE_HOLDER_VK_HASH=<field hash or 0>
HOUSING_FUND_VALUATION_VK_HASH=<field hash or 0>
PROTOCOL_REWARDS_WEIGHTS_VK_HASH=<field hash or 0>
REQUIRE_RECURSIVE_PROOFS=false
```

Notes:
- `0` means "not configured" (default).
- When a VK hash is configured, contracts expose recursive-proof entrypoints for that path.
- `REQUIRE_RECURSIVE_PROOFS=true` makes attest API routes reject requests that do not include a recursive proof bundle.

### End-to-end local bundle flow (Docker + live API)

Generate a bundle first (host machine with `nargo` + `bb` installed):

```bash
node scripts/generate-recursive-proof-bundle.mjs fsft-holder \
  --address 0x<your_aztec_account_address> \
  --out proofs/output/fsft-holder.json
```

If those binaries are not in `PATH`, set:

```bash
export NARGO_BIN=/usr/src/noir/noir-repo/target/release/nargo
export BB_BIN=/usr/src/barretenberg/cpp/build/bin/bb-avm
```

Use the generated VK hash for bootstrap:

```bash
export FUND_TOKEN_PRIVATE_HOLDER_VK_HASH="$(jq -r '.vkHashDecimal' proofs/output/fsft-holder.json)"
export REQUIRE_RECURSIVE_PROOFS=true
docker compose --profile aztec up
```

Submit the recursive bundle to the live route:

```bash
node scripts/submit-recursive-bundle.mjs governance \
  --bundle proofs/output/fsft-holder.json \
  --address 0x<your_aztec_account_address> \
  --account-index 0
```

Expected result: HTTP 200 with `privateFsftProofMode: "recursive-verified"`.

Other bundle kinds:
- `valuation` -> `HOUSING_FUND_VALUATION_VK_HASH`
- `rewards` -> `PROTOCOL_REWARDS_WEIGHTS_VK_HASH`

Implementation note:
- The circuits in `proofs/recursive/*` are integration/demo circuits for recursive wiring.
- They only check input shape / non-zero values. They do NOT bind to live private
  note state, do NOT bind their witnesses with a Poseidon2 commitment, and expose
  identity/amount inputs publicly. They must not be relied on for any security or
  privacy property until hardened.

What each demo proof actually checks today (NOT what a production version would prove):
- FSFT holder proof: checks its inputs are non-zero plus a hardcoded `signal == 1`
  placeholder. It does **not** prove "I hold private FSFT" — it never reads any
  balance or note.
- Valuation proof: checks its inputs are non-zero. It does **not** constrain any
  relationship between sale price and minted FSFT, so it proves nothing about the
  valuation calculation.
- Rewards weight proof: checks its inputs are non-zero and that the weights sum is
  non-zero. It does **not** prove the weights were computed from valid inputs.

---

## Frontend Architecture

### Dual-Mode Design

The frontend runs in two modes, controlled by environment variables:

| Variable | Value | Effect |
|----------|-------|--------|
| `NEXT_PUBLIC_SIMULATION` | `true` (default) | In-memory simulation engine |
| `NEXT_PUBLIC_SIMULATION` | `false` | Live mode (reads contract state) |
| `AZTEC_LIVE` | `true` | Server-side routes call Aztec node |
| `NEXT_PUBLIC_DEV_MODE` | `true` | Skip KYC in UI, show test accounts |

In live mode (`AZTEC_LIVE=true`), every API route tries the real contract first
and falls back to simulation if it fails:

```typescript
// Every API route follows this pattern
if (isLiveModeEnabled()) {
  try {
    const data = await getLive...();
    return NextResponse.json({ ...data, source: "aztec" });
  } catch {
    // Falls back silently
  }
}
return NextResponse.json({ ...getSimulation...(), source: "simulation" });
```

### Request Flow

```
Browser                    Next.js Server              Aztec Node
  │                             │                          │
  ├─ GET /api/fund/stats ──────►│                          │
  │                             ├─ isLiveModeEnabled?      │
  │                             │   yes: getLiveFundStats() │
  │                             ├─────────────────────────►│
  │                             │◄── simulateTx result ────┤
  │◄── { source: "aztec" } ─────┤                          │
  │                             │   no / error: simulation  │
  │◄── { source: "simulation" } ┤                          │
```

### Server vs Client Separation

| Concern | Where | Why |
|---------|-------|-----|
| Contract reads (simulate) | Server (API routes) | Node.js `AztecNode` client, no NAPI |
| Contract writes (send) | **Client (browser)** | Needs signing keys, user approval |
| Wallet key management | **Client (browser)** | `BrowserEmbeddedWallet` uses WASM |
| zkPassport verification | Client + Server | Proof generated client-side, verified on-chain |

> **Note on `@aztec/wallets/embedded`**: The `EmbeddedWallet` package exists in
> two exports — `browser` (WASM, works in Next.js client components) and `node`
> (NAPI binaries). Server-side Next.js routes use the `node` export which requires
> native binaries incompatible with the frontend container's Node.js version.
> Therefore: **never import `@aztec/wallets/embedded` in server components or
> API routes**. Use it only in `'use client'` components.

---

## Wallet & Account Model

### Test Accounts (Local Devnet)

The Aztec local devnet pre-deploys 3 Schnorr accounts. These are the same
accounts the bootstrap script imports and uses for contract deployment:

| Account | Role | Address |
|---------|------|---------|
| test0 | Admin (deploys all contracts) | From `NEXT_PUBLIC_ADMIN_ADDRESS` |
| test1 | Test investor | Pre-known key |
| test2 | Test investor | Pre-known key |

Account keys come from `INITIAL_TEST_SECRET_KEYS` in `@aztec/accounts/testing`.

### Browser Wallet Connection

The frontend uses `BrowserEmbeddedWallet` for client-side interactions:

```typescript
// In a 'use client' component:
import { EmbeddedWallet } from "@aztec/wallets/embedded";
// ↑ resolves to BrowserEmbeddedWallet in browser context (WASM, no NAPI)

const wallet = await EmbeddedWallet.create("http://aztec:8080", {
  ephemeral: true,  // in-memory, no persistence
});

// Import test accounts
const { INITIAL_TEST_SECRET_KEYS } = await import("@aztec/accounts/testing");
// ... create and register Schnorr accounts
```

See `src/hooks/useAztecWallet.ts` for the full React hook.

### Server-Side (API Routes)

API routes use `createAztecNodeClient` for read-only node access:

```typescript
import { getNode } from "@/lib/aztecClient";
const node = await getNode();
const info = await node.getNodeInfo();
```

For contract simulations, the `getWallet()` helper in `aztecClient.ts` returns
the node client. This works for `.simulate()` calls on contracts but **not**
for `.send()` (which requires signing keys). Write operations must be done
from the browser.

---

## Changelog Workflow

- `CHANGELOG.md` is the canonical release history.
- Every shipped feature/fix should update the current `Unreleased` section.
- On release, move `Unreleased` entries into a dated section and start a new `Unreleased` block.

---

## Contracts Reference

### Overview

| Contract | File | Purpose |
|----------|------|---------|
| `KYCVerifier` | `contracts/kyc_verifier/` | KYC registry — prove identity without revealing documents |
| `FundToken` (FSFT) | `contracts/fund_token/` | ERC-20-like token with public + private balances |
| `HousingFund` | `contracts/housing_fund/` | Core fund: deposit, withdraw, yield, DeFi routing |
| `Governance` | `contracts/governance/` | Property proposals and voting |
| `DeFiVault` | `contracts/defi_vault/` | Yield stub (simulates 3% APY on locked funds) |
| `FSFTDex` | `contracts/fsft_dex/` | Investor-only FSFT/EUR orderbook with NAV guardrails |
| `ProtocolRewards` | `contracts/protocol_rewards/` | Protocol token epoch emissions and claims |

### Contract Wiring

After deployment, contracts are connected:

```
HousingFund.set_contracts(kyc, token, vault, gov)
DeFiVault.set_housing_fund(housing_fund)
FundToken.set_admin(housing_fund)
ProtocolToken.set_admin(protocol_rewards)
```

This means:
- **HousingFund** is the entry point for all user operations
- HousingFund calls FundToken to mint/burn shares
- HousingFund calls DeFiVault to lock/unlock yield
- HousingFund checks KYCVerifier before allowing deposits
- HousingFund calls Governance for proposal execution

### Key Public Functions

```
HousingFund:
  deposit(amount: Field)           — invest in the fund
  withdraw(amount: Field)          — exit your position
  get_total_deposits() → Field     — total fund value
  get_investor_count() → Field     — number of investors

KYCVerifier:
  is_verified(address: AztecAddress) → bool   — KYC check
  register(address: AztecAddress)             — admin registers a user

FundToken:
  balance_of_public(address) → Field    — public balance
  total_supply() → Field                — total FSFT tokens

Governance:
  create_proposal(title_hash, desc_hash, amount) → Field   — propose
  vote(proposal_id, yes_votes, no_votes)                   — vote
  get_proposal(id) → Proposal                              — read
```

### Contract Addresses

Set automatically by bootstrap into `frontend/.env.local`:

```env
NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_FUND_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_DEFI_VAULT_ADDRESS=0x...
NEXT_PUBLIC_HOUSING_FUND_ADDRESS=0x...
NEXT_PUBLIC_GOVERNANCE_ADDRESS=0x...
NEXT_PUBLIC_FSFT_DEX_ADDRESS=0x...
NEXT_PUBLIC_EUR_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS=0x...
NEXT_PUBLIC_ADMIN_ADDRESS=0x...
```

---

## Development Guide

### Option A: Full Docker (recommended)

```bash
docker compose --profile aztec up
```

Edit files in `frontend/src/` — Next.js hot-reloads inside the container.
Edit contracts in `contracts/` — requires re-running bootstrap to recompile.

### Option B: Simulation Only

```bash
docker compose --profile sim up
# or locally:
cd frontend && npm install && npm run dev
```

All Aztec code is bypassed. Instant reload, no blockchain needed.

### Option C: Hybrid (Aztec in Docker, Frontend Local)

```bash
# Start Aztec + bootstrap only (no frontend)
docker compose --profile aztec up anvil aztec aztec-bootstrap

# Wait for bootstrap to finish, then:
cp "$(docker run --rm -v fair-squares-noir_contract-env:/out alpine cat /out/.env.contracts)" \
   frontend/.env.local

# Run frontend locally
cd frontend && npm install && npm run dev
```

### Rebuilding After Contract Changes

```bash
# Stop bootstrap + frontend (keep Anvil + Aztec running)
docker rm -f fair-squares-noir-aztec-bootstrap-1 fair-squares-noir-frontend-1
docker volume rm fair-squares-noir_contract-env

# Re-run bootstrap (recompiles + redeploys)
docker compose --profile aztec up aztec-bootstrap

# Watch bootstrap logs
docker logs -f fair-squares-noir-aztec-bootstrap-1

# Once bootstrap exits 0, restart frontend
docker compose --profile aztec up frontend
```

### Adding a New Contract Function

1. Add the function to the Noir contract in `contracts/<name>/src/main.nr`
2. Run bootstrap to recompile and redeploy
3. The artifact JSON in `frontend/src/artifacts/` is regenerated automatically
4. Add the call to `frontend/src/lib/aztecLive.ts`
5. Add API route in `frontend/src/app/api/`
6. Add simulation fallback in `frontend/src/lib/simulation.ts`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_AZTEC_PXE_URL` | `http://aztec:8080` | Aztec node URL |
| `NEXT_PUBLIC_SIMULATION` | `true` | Use simulation engine |
| `AZTEC_LIVE` | `false` | Server routes call real contracts |
| `NEXT_PUBLIC_DEV_MODE` | `false` | Skip KYC, show dev tools |
| `NEXT_PUBLIC_KYC_VERIFIER_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_FUND_TOKEN_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_HOUSING_FUND_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_GOVERNANCE_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_DEFI_VAULT_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_FSFT_DEX_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_EUR_TOKEN_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS` | — | Set by bootstrap |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | — | Set by bootstrap |
| `GOVERNANCE_VOTING_WINDOW_BLOCKS` | `12` (compose) | Voting window in L2 blocks (set by bootstrap) |
| `BOOTSTRAP_COMPILE_JOBS` | number of cores | Parallel nargo compiles during bootstrap (~0.45 GB each) |

The local network produces an L2 block per pending transaction (the v6
`AutomineSequencer` warps L1 time instead of waiting for slots), so the voting
window advances with activity, not wall-clock time: `scripts/seed-fsft.sh`
pushes the chain past a deadline by sending filler transactions.

---

## Troubleshooting

### Frontend shows "simulation" even with AZTEC_LIVE=true

The live mode call failed silently. Check:

```bash
docker logs fair-squares-noir-frontend-1 | grep "live mode failed"
```

Common causes:
- Bootstrap didn't finish yet (wait for `exit 0` in `docker ps`)
- Contract addresses not set in `.env.local` (check `docker exec frontend-1 cat /app/.env.local`)
- Aztec node unreachable (`curl http://localhost:8080/status`)

### Bootstrap exits with code 1

```bash
docker logs fair-squares-noir-aztec-bootstrap-1 | tail -30
```

If you see `"connection refused"` → the Aztec node isn't healthy yet. Bootstrap
waits for health, but if the node crashed, restart the full stack.

If you see `"deploy failed"` → a contract function name mismatch. Check that
artifact function names don't have `__aztec_nr_internals__` prefix:

```bash
# Inside bootstrap container:
docker run --rm --entrypoint bash \
  -v ./contracts:/workspace/contracts \
  azteclabs/aztec:6.0.0-rc.3 \
  -c "cat /workspace/contracts/housing_fund/target/housing_fund.json | \
      python3 -c \"import json,sys; a=json.load(sys.stdin); \
      print([f['name'] for f in a['functions'][:10]])\""
```

### `NAPI binary not found` in frontend logs

You're importing `@aztec/wallets/embedded` in a server component or API route.
Move the import to a `'use client'` component only. See [Server vs Client Separation](#server-vs-client-separation).

### Anvil was restarted and now nothing works

Full stack teardown required — Anvil is stateful and the Aztec L2 keeps
references to L1 contract addresses from the original Anvil instance.

```bash
docker compose --profile aztec down -v   # -v removes volumes too
docker compose --profile aztec up
```

### `Module not found: @aztec/wallets/embedded`

The package wasn't installed:

```bash
cd frontend && npm install @aztec-labs/wallets@6.0.0-rc.3
# Then rebuild:
docker compose --profile aztec build frontend
```

### Contract call returns `ABI encoder failed`

Usually means you're using an alias (`accounts:test0`, `contracts:housing_fund`)
in a position that expects a real hex address. Use the actual `$VAR` value.

### Blocks stopped being produced

```bash
# Check sequencer logs
docker logs fair-squares-noir-aztec-1 | grep -i "block\|error\|sequencer" | tail -20

# Check L1 (Anvil) is still running
curl http://localhost:8545 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}'
```

If Anvil is healthy but no L2 blocks appear, the rollup may have failed to
submit. Restart the full stack.

---

## Project Structure

```
fair-squares-noir/
│
├── docker-compose.yml                 # Full stack orchestration
│   # profiles:
│   #   aztec = anvil + aztec + bootstrap + frontend
│   #   sim   = frontend only (simulation mode)
│
├── contracts/                         # Noir smart contracts
│   ├── kyc_verifier/
│   │   ├── src/main.nr               # KYC registry contract
│   │   └── Nargo.toml
│   ├── fund_token/
│   │   ├── src/main.nr               # FSFT token (public + private balances)
│   │   └── Nargo.toml
│   ├── housing_fund/
│   │   ├── src/main.nr               # Core fund logic
│   │   └── Nargo.toml
│   ├── governance/
│   │   ├── src/main.nr               # Proposals + voting
│   │   └── Nargo.toml
│   └── defi_vault/
│       ├── src/main.nr               # Yield stub (3% APY)
│       └── Nargo.toml
│
├── scripts/
│   └── bootstrap-local-network.sh    # Compile → deploy → wire → write .env
│
├── docs/
│   └── REFERENCES.md                 # Aztec + zkPassport doc links
│
└── frontend/                         # Next.js 15 application
    ├── Dockerfile
    ├── package.json
    ├── .env.local                     # Auto-generated by bootstrap (gitignored)
    │
    └── src/
        ├── app/
        │   ├── page.tsx              # Dashboard (fund stats)
        │   ├── fund/page.tsx         # Housing fund activity + share price formation
        │   ├── invest/page.tsx       # Deposit / withdraw
        │   ├── rewards/page.tsx      # Protocol token distribution progress
        │   ├── governance/page.tsx   # Proposals list
        │   ├── governance/[id]/page.tsx  # Proposal detail + vote
        │   ├── portfolio/page.tsx    # Your balance + share
        │   ├── kyc/page.tsx          # KYC verification flow
        │   └── api/
        │       ├── fund/stats/       # GET  fund totals
        │       ├── fund/deposit/     # POST deposit
        │       ├── fund/withdraw/    # POST withdraw
        │       ├── kyc/status/       # GET  KYC status
        │       ├── kyc/register/     # POST register
        │       ├── governance/proposals/  # GET proposals
        │       ├── governance/vote/  # POST vote
        │       ├── rewards/overview/ # GET global FSP distribution status
        │       ├── portfolio/        # GET portfolio
        │       └── wallet/accounts/  # GET registered accounts
        │
        ├── components/
        │   ├── WalletConnect.tsx     # Connect button + account picker
        │   ├── FundStats.tsx         # Dashboard stats cards
        │   ├── InvestForm.tsx        # Deposit/withdraw form
        │   ├── KYCFlow.tsx           # zkPassport KYC steps
        │   ├── PrivateBalance.tsx    # Your private balance
        │   └── ProposalCard.tsx      # Governance proposal card
        │
        ├── hooks/
        │   └── useAztecWallet.ts     # React hook: BrowserEmbeddedWallet
        │
        ├── artifacts/                # Contract TypeScript wrappers
        │   ├── KYCVerifier.ts        # (generated by bootstrap)
        │   ├── FundToken.ts
        │   ├── HousingFund.ts
        │   ├── Governance.ts
        │   └── DeFiVault.ts
        │
        └── lib/
            ├── aztecClient.ts        # AztecNode client (server-safe, no NAPI)
            ├── aztecLive.ts          # Live contract calls (server API routes)
            ├── aztec.ts              # PXE URL + mode helpers
            ├── contracts.ts          # Client-side API wrappers
            ├── simulation.ts         # In-memory simulation engine
            └── zkpassport.ts         # zkPassport SDK integration
```

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Smart contracts | Noir / Aztec.nr | `aztec-labs-eng/aztec-nr@v6.0.0-rc.3` |
| ZK runtime | Aztec Network (devnet) | `azteclabs/aztec:6.0.0-rc.3` |
| L1 chain | Anvil (Foundry) | bundled in Aztec image |
| Frontend | Next.js 15, React 19 | — |
| Styling | Tailwind CSS 4 | — |
| Language | TypeScript | — |
| Wallet (browser) | `@aztec-labs/wallets/embedded` (WASM) | `6.0.0-rc.3` |
| Identity | zkPassport SDK (dev mode) | `@zkpassport/sdk` |

---

## License

MIT
