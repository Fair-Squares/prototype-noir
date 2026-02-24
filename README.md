# Fair Squares — Decentralized Affordable Housing Fund

A privacy-first housing investment fund built on [Aztec Network](https://aztec.network), using zero-knowledge proofs to protect investor privacy while keeping the fund fully transparent.

## Reference Documentation

See **[docs/REFERENCES.md](docs/REFERENCES.md)** for links to:
- Aztec v4 docs, tutorials, and API patterns
- zkPassport SDK (dev mode for local testing)
- Version matrix for all dependencies

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User (Browser)                        │
│              Next.js Frontend (port 3000)                │
│    Dashboard │ Invest │ Governance │ Portfolio │ KYC     │
└──────────────────────────┬──────────────────────────────┘
                           │
              API Routes (simulation or live Aztec)
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Aztec Network (optional)                    │
│  KYCVerifier │ FundToken │ HousingFund │ Governance │    │
│              DeFiVault (yield stub)                      │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Frontend Only (simulation mode, instant)

```bash
docker compose up
# Open http://localhost:3000
```

### Option 2: Full Stack with Aztec Local Network

```bash
docker compose --profile aztec up
# Open http://localhost:3000
```

This boots:
1. **Aztec** local network (includes Anvil L1 + Aztec node + PXE + test accounts)
2. **Bootstrap** container: compiles all 5 Noir contracts, deploys them, wires them together
3. **Frontend** with live Aztec connection

### Option 3: Local Development (no Docker)

```bash
# Install Aztec CLI
VERSION=4.0.0-devnet.2-patch.0 bash -i <(curl -sL https://install.aztec.network/4.0.0-devnet.2-patch.0)

# Start Aztec local network
aztec start --local-network

# In another terminal, compile contracts
for c in kyc_verifier fund_token defi_vault housing_fund governance; do
  (cd contracts/$c && aztec compile)
done

# Start frontend
cd frontend && npm install && npm run dev
# Open http://localhost:3000
```

## How It Works

### Privacy Model

- **Private deposits**: Nobody can see who invested or how much (via FSFT private balances)
- **Public totals**: Total fund size, yield, and vote results are visible
- **KYC**: zkPassport verification — prove identity without revealing documents
- **ZK proofs**: All privacy powered by Aztec's zero-knowledge proof system

### Contracts (Noir / Aztec v4)

| Contract | Purpose | State |
|----------|---------|-------|
| `KYCVerifier` | On-chain KYC registry (zkPassport integration) | Public |
| `FundToken` (FSFT) | Token with public + private balances | Hybrid |
| `HousingFund` | Core fund: deposit/withdraw, DeFi management | Public |
| `Governance` | Voting on property acquisitions | Public (private voting planned) |
| `DeFiVault` | Yield stub (simulates 3% APY) | Public |

### Simulation Mode

The frontend includes a full simulation engine. Enable "Dev Mode" to skip KYC verification.

## Pages

| Page | Route | Access |
|------|-------|--------|
| Dashboard | `/` | Public — fund stats, how it works |
| Invest | `/invest` | Authenticated — deposit/withdraw |
| Governance | `/governance` | Public results, voting |
| Portfolio | `/portfolio` | Private — your balance & share |
| KYC | `/kyc` | Private — zkPassport verification |

## Tech Stack

| Component | Version |
|-----------|---------|
| Smart Contracts | Noir (Aztec v4) |
| Aztec Runtime | `aztecprotocol/aztec:4.0.0-devnet.2-patch.0` |
| Aztec.nr | `v4.0.0-devnet.2-patch.0` (aztec-nr repo) |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Identity | zkPassport (`@zkpassport/sdk`, dev mode) |

## Project Structure

```
fair-squares-noir/
├── docker-compose.yml          # Dev stack (frontend + optional Aztec)
├── docs/
│   └── REFERENCES.md           # Links to Aztec + zkPassport docs
├── contracts/                  # 5 Noir smart contracts
│   ├── kyc_verifier/
│   ├── fund_token/
│   ├── housing_fund/
│   ├── governance/
│   └── defi_vault/
├── scripts/                    # Deploy & setup scripts
│   ├── bootstrap-local-network.sh
│   ├── deploy.ts
│   └── package.json
└── frontend/                   # Next.js application
    ├── Dockerfile
    ├── src/
    │   ├── app/                # Pages & API routes
    │   ├── components/         # UI components
    │   └── lib/                # Contracts, simulation, utils
    └── package.json
```

## License

MIT
