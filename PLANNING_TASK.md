# Fair Squares — Noir Smart Contract Planning Task

You are a senior blockchain architect specialising in Aztec Network and Noir ZK smart contracts.

## Your Mission

Research and create a comprehensive implementation plan for a **Fair Squares decentralised affordable housing fund** prototype built on Aztec Network using Noir smart contracts.

## What Fair Squares Is

A decentralised protocol that:
1. Pools money from verified social investors into a shared housing fund
2. Puts idle funds into DeFi to generate yield (~3% annual, capped to keep rents affordable)
3. Buys properties through community governance votes
4. Hands building management to housing corporations
5. Investors receive pro-rata shares and capped returns

## Privacy Model (Critical)

**PUBLIC (visible to everyone):**
- Total fund balance
- Aggregate fund stats (total investors count, total properties)
- Governance outcomes (did a vote pass? by what margin?)
- Property details after acquisition

**PRIVATE (hidden, ZK proofs only):**
- Who contributed and how much
- Individual investor balances and share
- Who received a housing allocation
- Individual voting choices (revealed only in aggregate)
- Identity documents (only ZK proof of KYC used)

## Step 1 — Research (use WebFetch tool extensively)

Research ALL of these:

### Aztec & Noir
1. https://noir-lang.org/docs — Noir language docs
2. https://docs.aztec.network — Aztec network overview
3. https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/noir-contracts/contracts — Real contract examples
4. https://raw.githubusercontent.com/AztecProtocol/aztec-packages/next/noir-projects/noir-contracts/contracts/token_contract/src/main.nr — Token contract example
5. https://docs.aztec.network/developers/getting_started — Dev quickstart
6. https://docs.aztec.network/aztec/concepts/storage/partial_notes — Partial notes for private state
7. https://github.com/AztecProtocol/aztec-packages/tree/next/yarn-project/aztec.js — Aztec.js

### zkPassport
1. https://docs.zkpassport.id — Main docs
2. https://github.com/zkpassport/zkpassport-sdk — SDK
3. https://docs.zkpassport.id/verify-on-chain — On-chain verification

### Dev Environment
1. https://docs.aztec.network/developers/aztec-sandbox — Sandbox docs
2. https://hub.docker.com/r/aztecprotocol/aztec — Docker image

## Step 2 — Write the Plan

Save a comprehensive plan to: `/home/ilhan/.openclaw/workspace/fair-squares-specs/specs/11-noir-prototype-plan.md`

The plan must cover:

### A. Architecture Overview
- System diagram (text-based)
- How public and private state coexist in Aztec
- How the note system enables private balances
- Contract interaction flow

### B. Contracts (Noir)

For EACH contract specify:
- Filename and location
- Purpose
- Public state (storage visible to all)
- Private state (stored as notes)
- Functions (name, inputs, outputs, public/private)
- Key Noir patterns used

Contracts needed:
1. **HousingFund** — core fund: private deposits, public total
2. **FundToken (FSFT)** — private balances, pro-rata tracking
3. **KYCVerifier** — verify zkPassport proofs on-chain
4. **Governance** — private voting, public results
5. **DeFiVault** — yield stub (placeholder, mockable)

### C. zkPassport Integration
- What proof is needed (proof of KYC, not sanctions, age ≥ 18)
- How to verify on Aztec L2
- Mock approach for dev/prototype

### D. Key Noir Patterns (with code snippets)
- Private note creation and nullification
- Public/private state storage
- Proof verification
- Token transfer pattern

### E. Dev Environment Setup
- Exact commands to install Aztec sandbox via Docker
- How to deploy contracts locally
- Test wallet setup
- How to run the full local stack

### F. Frontend Plan (Next.js / React)
- Pages needed: Dashboard, Invest, Governance, Portfolio
- How to use aztec.js to connect wallet
- What to display publicly vs what requires wallet connection
- Key UI components

### G. Implementation Order
Step-by-step with estimated complexity for each step:
1. Dev environment setup
2. Contract 1... etc.

### H. File Structure
Complete directory layout for the project.

### I. What to Mock vs Implement
- What can be stubbed for prototype
- What must be real

## Step 3 — Save Research Notes

Save key Noir and Aztec patterns you found to:
`/home/ilhan/.openclaw/workspace/fair-squares-specs/research/noir-aztec-resources.md`

Include:
- Actual Noir syntax for common patterns
- Aztec storage types (Map, PublicMutable, etc.)
- Contract deployment commands
- Any gotchas or version-specific notes

## Output

When done, run:
```
openclaw system event --text "Fair Squares Noir plan complete — check fair-squares-specs/specs/11-noir-prototype-plan.md" --mode now
```

Be thorough. The plan will be given directly to an implementation agent.
