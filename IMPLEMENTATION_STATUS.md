# Implementation Status

*Updated: 2026-02-26*

## ✅ Governance + Investor Role + NAV v2 (Implemented)

### On-chain / Noir
- [x] `KYCVerifier` now tracks investor role (`is_investor`) in addition to verified status
- [x] `register_kyc` grants investor role; `revoke_kyc` removes verified + investor role
- [x] `Governance` constructor now includes `kyc_verifier` and `min_quorum_votes`
- [x] Governance enforces investor role for `create_proposal` and `cast_vote`
- [x] Governance quorum rule enforced in `finalize_proposal`: `yes + no >= min_quorum_votes`
- [x] `execute_proposal` is permissionless once passed (no council/admin execution gate)
- [x] `HousingFund.deposit` enforces investor role via KYC view call
- [x] Permissionless distribution lifecycle added to HousingFund:
  - [x] `open_distribution(proposal_id)`
  - [x] `claim_distribution(proposal_id)`
  - [x] `get_claimable_amount(proposal_id, user)`
  - [x] `has_claimed(proposal_id, user)`
  - [x] `get_distribution_status(proposal_id)`
- [x] HousingFund distribution snapshot + anti-double-claim storage added
- [x] Governance/HousingFund Nargo deps updated for cross-contract calls

### Bootstrap / Wiring
- [x] Governance deploy args updated to `(housing_fund, kyc_verifier, voting_window_blocks, min_quorum_votes)`
- [x] `GOVERNANCE_MIN_QUORUM_VOTES` support added to bootstrap and env example
- [x] FSFT admin transfer to HousingFund in bootstrap (`FundToken.set_admin(housing_fund)`)
- [x] EUR token admin left unchanged for demo top-up

### Backend API
- [x] `POST /api/governance/proposals` `action=execute` now:
  - [x] executes proposal with selected actor
  - [x] opens distribution via `housing_fund.open_distribution`
  - [x] removes admin reserve/mint loop
- [x] New `POST /api/governance/claim` route for `claim_distribution`
- [x] Investor role checks mirrored in API flow (create/vote/deposit prechecks + simulation parity)
- [x] `GET /api/kyc/status` now returns `verified`, `isInvestor`, and `roles`
- [x] `GET /api/fund/stats` and `GET /api/portfolio` now return NAV-centric fields (`navEur`, `navPerFsftEur`)
- [x] Portfolio FSFT market value now derived from NAV/FSFT (not fixed €1)

### Simulation v2 parity
- [x] Investor role state added and tied to KYC registration/revocation
- [x] Investor-only deposit/proposal/vote enforcement
- [x] Quorum=2 finalize semantics
- [x] Execute -> open distribution -> claim flow added
- [x] NAV fields exposed and used in simulated valuation

### Frontend UX / Messaging
- [x] Governance cards/modal now show quorum progress and quorum-block reason
- [x] Executed proposals now show claim status + claim CTA in modal
- [x] Investor role surfaced in UI (KYC success text, wallet badge, account badges)
- [x] Invest flow blocks deposit UX when investor role is missing
- [x] FSFT copy updated from fixed peg to NAV/share-token narrative
- [x] Fund/portfolio views now surface NAV and NAV per FSFT

### Verification
- [x] `aztec compile` passes for all contracts on Aztec 6.0.0-rc.3 (storage packed into structs for the Noir 1.0 type-complexity cap)
- [x] `aztec test` runs for all contracts (0 in-repo Noir tests currently)
- [x] `npx tsc --noEmit --incremental false` (frontend) passes
- [x] `npm run build` (frontend) passes
- [x] `npx tsc --noEmit --incremental false` (scripts) passes

---

## ✅ Implemented

### Smart Contracts (Noir)
- [x] **KYCVerifier** — full contract: admin, verifiers, register/revoke KYC, view functions
- [x] **FundToken (FSFT)** — private balances (Owned<BalanceSet>), mint/burn (admin-only), transfer, public total_supply
- [x] **DeFiVault** — yield stub with time-based 3% APY calculation, deposit/withdraw/accrue
- [x] **HousingFund** — core fund: private deposit/withdraw, KYC gate, DeFi allocation, property reservation, pause/unpause
- [x] **Governance** — private voting with nullifiers, proposal creation, finalization, public results
- [x] **FSFTDex** — investor-gated secondary FSFT/EUR orderbook prototype
- [x] **ProtocolRewards** — epoch rewards allocation/claiming prototype
- [x] **Nargo.toml** for all 7 contracts with pinned aztec-nr v6.0.0-rc.3 dependencies (`aztec-labs-eng/aztec-nr`)

### Deployment
- [x] **deploy.ts** — deploys contracts in dependency order, saves addresses to frontend/.env.local
- [x] **docker-compose.yml** — Aztec local network (Docker image `azteclabs/aztec:6.0.0-rc.3`) + local Anvil L1 (`ETHEREUM_HOSTS`) + healthchecks
- [x] **bootstrap-local-network.sh** — waits for PXE, compiles contracts, runs deploy script in Docker profile `aztec`

### Frontend (Next.js)
- [x] **Dashboard** — public fund stats, how-it-works section
- [x] **Invest page** — deposit/withdraw form with KYC gate
- [x] **Governance page** — proposal list with vote buttons
- [x] **Proposal detail page** — single proposal view
- [x] **Portfolio page** — private balance display, share calculation, yield estimate
- [x] **KYC page** — zkPassport flow with QR code + dev mode skip
- [x] **Layout** — navigation, dark theme (emerald/teal accents)

### Components
- [x] FundStats, InvestForm, ProposalCard, PrivateBalance, KYCFlow, WalletConnect

### API Routes
- [x] `/api/zkpassport/request` — create verification request (stub)
- [x] `/api/zkpassport/status` — poll verification status (stub)
- [x] `/api/kyc/register` — register KYC on-chain (stub)
- [x] `/api/kyc/status` — check KYC status (stub)
- [x] Live-read fallback wiring: `/api/wallet/accounts`, `/api/fund/stats`, `/api/kyc/status`, `/api/portfolio` try Aztec first when `AZTEC_LIVE=true`

### Lib
- [x] `aztec.ts` — PXE client, wallet connect, EUR formatting
- [x] `contracts.ts` — address loading, fetchFundStats, fetchKYCStatus, fetchProposals
- [x] `zkpassport.ts` — SDK wrapper, dev mode skip, polling

### Documentation
- [x] `11-noir-prototype-plan.md` — comprehensive implementation plan
- [x] `research/noir-aztec-resources.md` — Noir patterns, Aztec storage types, zkPassport SDK
- [x] `README.md` — project overview and quick start
- [x] `IMPLEMENTATION_STATUS.md` — this file

## 🟡 Stubs / Placeholders

- **DeFi yield** — fixed 3% calculation, no actual DeFi protocol integration
- **Stablecoin** — deposit/withdraw logic skips actual token transfer (prototype accounting only)
- **zkPassport API routes** — return stub responses; SDK calls are commented out with TODO
- **KYC API routes** — return stub responses; contract calls are commented out with TODO
- **Fund stats** — return zeroes; need generated TypeScript contract wrappers after compile
- **Portfolio balance** — returns 0; needs PXE note discovery after contract deploy
- **Governance proposals** — returns empty array; needs contract interaction after deploy

## ❌ Known Issues / TODOs

1. **Frontend contract interaction** — several routes are still simulation-backed; live contract mutation paths need generated TypeScript bindings and deployed addresses
2. **zkPassport real integration** — SDK imported but not called; needs domain registration with zkPassport
3. **FundToken admin transfer** — after deploying HousingFund, FundToken.admin should be set to HousingFund address
4. **Wallet connect UX** — prototype uses local-network pre-funded accounts; real wallet flow requires account abstraction setup

## 🚀 How to Run

```bash
# Full stack: Aztec network + compile + deploy + frontend (one command)
docker compose --profile aztec up

# Frontend only (simulation, no Aztec needed)
docker compose --profile sim up
```

The `--profile aztec` flow:
1. Starts Anvil (L1) and Aztec node (PXE) containers
2. Bootstrap container compiles all 5 contracts and deploys them
3. Contract addresses are written to a shared Docker volume
4. Frontend starts with addresses injected via `.env.local`

## Next Steps (after prototype)

1. Fix any Aztec API compatibility issues found during compilation
2. Generate TypeScript contract wrappers (`aztec codegen`)
3. Wire all frontend stubs to real contract calls via codegen wrappers
4. Set up real zkPassport domain for production KYC
5. Add real stablecoin (FSEUR) via Aztec L1 bridge
6. Deploy to Aztec testnet (alpha-testnet)
7. Integrate a real DeFi protocol for yield
