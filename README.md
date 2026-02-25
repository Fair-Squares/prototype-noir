# Fair Squares -- Decentralized Affordable Housing Fund

A privacy-first housing investment fund built on [Aztec Network](https://aztec.network), using zero-knowledge proofs to protect investor privacy while keeping the fund fully transparent.

## Quick Start

### One-line deploy (full Aztec network + contracts + frontend)

```bash
docker compose --profile aztec up
# Open http://localhost:3000
```

This single command:
1. Starts **Anvil** (local Ethereum L1) on port 8545
2. Starts **Aztec node** (PXE + sequencer) on port 8080
3. **Compiles** all 5 Noir contracts inside the Aztec container
4. **Deploys** them to the local network and wires them together
5. **Writes** contract addresses to the frontend environment
6. Starts the **Next.js frontend** on port 3000 with live Aztec connectivity

### Frontend only (simulation mode, no Aztec needed)

```bash
docker compose --profile sim up
# Open http://localhost:3000
```

Uses an in-memory simulation engine -- instant startup, no blockchain required.

### Local development (no Docker)

```bash
# Install Aztec CLI
VERSION=4.0.0-devnet.2-patch.1 bash -i <(curl -sL https://install.aztec.network/4.0.0-devnet.2-patch.1)

# Start Aztec local network
aztec start --local-network

# In another terminal, compile contracts
for c in kyc_verifier fund_token defi_vault housing_fund governance; do
  (cd contracts/$c && aztec compile .)
done

# Start frontend
cd frontend && npm install && npm run dev
```

## Reference Documentation

See **[docs/REFERENCES.md](docs/REFERENCES.md)** for links to:
- Aztec v4 docs, tutorials, and API patterns
- zkPassport SDK (dev mode for local testing)
- Version matrix for all dependencies

## Architecture

```
                    User (Browser)
              Next.js Frontend (port 3000)
    Dashboard | Invest | Governance | Portfolio | KYC
                         |
            API Routes (simulation or live Aztec)
                         |
              Aztec Network (optional)
  KYCVerifier | FundToken | HousingFund | Governance
                DeFiVault (yield stub)
```

### How the Docker deploy works

```
docker compose --profile aztec up
        |
        v
  +-----------+      +-----------+      +----------------+      +----------+
  |   Anvil   | ---> |   Aztec   | ---> | aztec-bootstrap| ---> | frontend |
  | (L1 chain)|      | (PXE node)|      | (compile+deploy|      | (Next.js)|
  | port 8545 |      | port 8080 |      |  write addrs)  |      | port 3000|
  +-----------+      +-----------+      +----------------+      +----------+
```

The bootstrap container:
- Waits for PXE to be healthy
- Compiles all 5 Noir contracts (`aztec compile`)
- Deploys them via `aztec-wallet deploy`
- Wires contracts together (set_contracts, set_housing_fund, set_admin)
- Writes contract addresses to a shared Docker volume
- Frontend picks up the addresses on startup

## Contracts (Noir / Aztec v4)

| Contract | Purpose | State |
|----------|---------|-------|
| `KYCVerifier` | On-chain KYC registry (zkPassport integration) | Public |
| `FundToken` (FSFT) | Token with public + private balances | Hybrid |
| `HousingFund` | Core fund: deposit/withdraw, DeFi management | Public |
| `Governance` | Voting on property acquisitions | Public (private voting planned) |
| `DeFiVault` | Yield stub (simulates 3% APY) | Public |

### Privacy Model

- **Private deposits**: Nobody can see who invested or how much (via FSFT private balances)
- **Public totals**: Total fund size, yield, and vote results are visible
- **KYC**: zkPassport verification -- prove identity without revealing documents
- **ZK proofs**: All privacy powered by Aztec's zero-knowledge proof system

### Simulation Mode

The frontend includes a full simulation engine that mirrors all contract behavior.
When running with `--profile sim`, no blockchain is needed. Enable "Dev Mode" to
skip KYC verification.

## Pages

| Page | Route | Access |
|------|-------|--------|
| Dashboard | `/` | Public -- fund stats, how it works |
| Invest | `/invest` | Authenticated -- deposit/withdraw |
| Governance | `/governance` | Public results, voting |
| Portfolio | `/portfolio` | Private -- your balance & share |
| KYC | `/kyc` | Private -- zkPassport verification |

## Tech Stack

| Component | Version |
|-----------|---------|
| Smart Contracts | Noir (Aztec v4) |
| Aztec Runtime | `aztecprotocol/aztec:4.0.0-devnet.2-patch.1` |
| Aztec.nr | `v4.0.0-devnet.2-patch.1` (aztec-nr repo) |
| Aztec.js SDK | `4.0.0-devnet.2-patch.1` |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Identity | zkPassport (`@zkpassport/sdk`, dev mode) |

## Project Structure

```
fair-squares-noir/
├── docker-compose.yml          # Full stack orchestration (profiles: aztec, sim)
├── docs/
│   └── REFERENCES.md           # Links to Aztec + zkPassport docs
├── contracts/                  # 5 Noir smart contracts
│   ├── kyc_verifier/
│   ├── fund_token/
│   ├── housing_fund/
│   ├── governance/
│   └── defi_vault/
├── scripts/                    # Deploy & setup scripts
│   ├── bootstrap-local-network.sh   # Compile + deploy + wire (runs in Docker)
│   ├── deploy.ts                    # Alternative JS SDK deploy script
│   └── package.json
└── frontend/                   # Next.js application
    ├── Dockerfile
    ├── src/
    │   ├── app/                # Pages & API routes
    │   ├── components/         # UI components
    │   └── lib/                # Contracts, simulation, aztecLive
    └── package.json
```

## License

MIT
