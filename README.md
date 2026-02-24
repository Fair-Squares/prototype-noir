# Fair Squares — Decentralized Affordable Housing Fund

A privacy-first housing investment fund built on [Aztec Network](https://aztec.network), using zero-knowledge proofs to protect investor privacy while keeping the fund fully transparent.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User (Browser)                        │
│              Next.js Frontend (port 3000)                │
│    Dashboard │ Invest │ Governance │ Portfolio │ KYC     │
└──────────────────────────┬──────────────────────────────┘
                           │
              API Routes (simulation engine)
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Aztec Network (optional)                    │
│  KYCVerifier │ FundToken │ HousingFund │ Governance │    │
│              DeFiVault (yield stub)                      │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Docker (recommended)

```bash
# Simulation mode — instant, no Aztec needed
docker compose up

# Open http://localhost:3000
```

### Option 2: Local Node.js

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev

# Open http://localhost:3000
```

### Option 3: Full Stack with Aztec Local Network

```bash
# Start Aztec local network + frontend + contract bootstrap
docker compose --profile aztec up

# Open http://localhost:3000
```

In `--profile aztec`, Compose also starts a local `anvil` L1 node that Aztec uses
via `ETHEREUM_HOSTS=http://anvil:8545`.

The `aztec-bootstrap` service waits for PXE, compiles contracts with
`@aztec/cli@4.0.0-devnet.2-patch.1`, and runs `scripts/deploy.ts` automatically.

Important: the app now supports partial live mode for read APIs, with automatic
simulation fallback when live calls fail.

Current live-mode status:
- `AZTEC_LIVE=true` is enabled in Docker by default.
- Read routes (`/api/wallet/accounts`, `/api/fund/stats`, `/api/kyc/status`, `/api/portfolio`) now try Aztec first and fall back to simulation on errors.
- Write routes (deposit/withdraw/vote/register) remain simulation-backed.

## How It Works

### Privacy Model

- **Private deposits**: Nobody can see who invested or how much
- **Private voting**: Cast governance votes without revealing your choice
- **Public totals**: Total fund size, yield, and vote results are visible
- **ZK proofs**: All privacy powered by Aztec's zero-knowledge proof system

### Contracts (Noir)

| Contract | Purpose |
|----------|---------|
| `KYCVerifier` | On-chain KYC registry (zkPassport integration) |
| `FundToken` (FSFT) | ERC-20 with private balances |
| `HousingFund` | Core fund: private deposit/withdraw, public totals |
| `Governance` | Private voting on property acquisitions |
| `DeFiVault` | Yield stub (simulates 3% APY) |

### Simulation Mode

The frontend includes a full simulation engine that mimics all contract behavior in-memory. This allows:

- Running without the Aztec local network
- Instant startup for demos
- Full interactive experience (deposit, withdraw, vote, KYC)
- Seeded with sample data (proposals, fund stats)

Enable "Dev Mode" to skip KYC verification (Skip KYC button).

## Pages

| Page | Route | Access |
|------|-------|--------|
| Dashboard | `/` | Public — fund stats, how it works |
| Invest | `/invest` | Authenticated — deposit/withdraw |
| Governance | `/governance` | Public results, private voting |
| Portfolio | `/portfolio` | Private — your balance & share |
| KYC | `/kyc` | Private — zkPassport verification |

## Tech Stack

- **Smart Contracts**: Noir (Aztec Network)
- **Frontend**: Next.js 15, React 19, Tailwind CSS 4
- **Identity**: zkPassport (zero-knowledge passport verification)
- **Aztec Runtime**: `aztecprotocol/aztec:4.0.0-devnet.2-patch.1` (Docker)
- **Aztec JS SDK**: `@aztec/aztec.js@4.0.0-devnet.2-patch.1`

## Project Structure

```
fair-squares-noir/
├── docker-compose.yml          # Dev stack (frontend + optional Aztec)
├── contracts/                  # 5 Noir smart contracts
│   ├── kyc_verifier/
│   ├── fund_token/
│   ├── housing_fund/
│   ├── governance/
│   └── defi_vault/
├── scripts/                    # Deploy & setup scripts
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
