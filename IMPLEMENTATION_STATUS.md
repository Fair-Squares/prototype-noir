# Implementation Status

*Updated: 2026-02-25*

## ✅ Implemented

### Smart Contracts (Noir)
- [x] **KYCVerifier** — full contract: admin, verifiers, register/revoke KYC, view functions
- [x] **FundToken (FSFT)** — private balances (Owned<BalanceSet>), mint/burn (admin-only), transfer, public total_supply
- [x] **DeFiVault** — yield stub with time-based 3% APY calculation, deposit/withdraw/accrue
- [x] **HousingFund** — core fund: private deposit/withdraw, KYC gate, DeFi allocation, property reservation, pause/unpause
- [x] **Governance** — private voting with nullifiers, proposal creation, finalization, public results
- [x] **Nargo.toml** for all 5 contracts with pinned aztec-packages v4.0.0-devnet.2-patch.1 dependencies

### Deployment
- [x] **deploy.ts** — deploys all 5 contracts in dependency order, saves addresses to frontend/.env.local
- [x] **docker-compose.yml** — Aztec local network (Docker image v4.0.0-devnet.2-patch.1) + local Anvil L1 (`ETHEREUM_HOSTS`) + healthchecks
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

1. **Contracts need compilation** — `aztec compile` required; some import paths and API calls may need adjustment for exact v4.0.0-devnet.2-patch.1 compatibility
2. **MessageDelivery import path** — the `.deliver(MessageDelivery.ONCHAIN_CONSTRAINED)` pattern may have changed between Aztec versions
3. **Cross-contract calls** — `KYCVerifier::at(addr).is_verified(sender).call(&mut self.context)` syntax needs verification
4. **Block timestamp access** — `BlockHeader::get_timestamp(self.context)` may use a different API
5. **Nullifier API** — `self.context.push_nullifier(nullifier)` needs verification
6. **poseidon2_hash import** — path `aztec::protocol::hash::poseidon2_hash` needs verification
7. **Frontend contract interaction** — all contract calls are stubbed; need generated TypeScript types after compile
8. **zkPassport real integration** — SDK imported but not called; needs domain registration with zkPassport
9. **FundToken admin transfer** — after deploying HousingFund, FundToken.admin should be set to HousingFund address
10. **Wallet connect UX** — prototype uses local-network pre-funded accounts; real wallet flow requires account abstraction setup
11. **Write routes are still simulation-backed** — deposit/withdraw/vote/register KYC are not yet wired to live contract mutations

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
