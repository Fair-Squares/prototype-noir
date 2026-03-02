# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased] - v3 Protocol Expansion

### Added
- Added recursive-verification contract primitives (v3.1 rollout path):
  - `FundToken.attest_private_holder_recursive(...)` + VK hash config/getter
  - `HousingFund.record_asset_sale_recursive(...)` + valuation VK hash config/getter
  - `ProtocolRewards.set_user_epoch_weights_recursive(...)` + rewards-weight VK hash config/getter
- Added local recursive bundle tooling:
  - `scripts/generate-recursive-proof-bundle.mjs` (builds VK/proof/public-input arrays + VK hash)
  - `scripts/submit-recursive-bundle.mjs` (submits generated bundle to live governance/rewards attest routes)
  - `proofs/recursive/*` demo Noir circuits for FSFT holder, valuation, and rewards-weight recursive paths
- Added browser-local dev account generation in wallet UI (`dev-1000+`) with persistent `fs_generated_accounts` storage and auto-select on create.
- Added simulation disclosure components:
  - Global `SimulationBanner`
  - Per-page `Simulation` mode badges on Overview/Invest/Trade/Proposals/Portfolio/KYC
- Added housing-fund transparency pages:
  - `GET /fund` with estimated share-price formula + fund activity views
  - `GET /rewards` with FSP distribution progress, yearly curve, and eligibility status
- Added `GET /api/rewards/overview` for global protocol-token distribution progress without requiring a user address.
- Added simulation-backed FSFT/EUR DEX APIs:
  - `GET/POST /api/dex/orders`
  - `POST /api/dex/match`
  - `POST /api/dex/cancel`
- Added governance eligibility APIs:
  - `GET /api/governance/eligibility`
  - `POST /api/governance/eligibility` (simulation FSFT voting attestation)
- Added protocol rewards APIs:
  - `GET /api/rewards/stats`
  - `POST /api/rewards/claim`
  - `POST /api/rewards/attest`
- Added proof-assurance metadata to API payloads:
  - Governance eligibility now returns `privateFsftProofMode` and `recursiveVkConfigured`
  - Rewards stats now returns FSFT proof guidance/mode fields
  - Fund stats now returns valuation proof mode fields
- Added `frontend/src/app/dex/page.tsx` with investor-only DEX UI, NAV-band messaging, and user order controls.
- Added protocol rewards client types and helper calls in `frontend/src/lib/contracts.ts`.
- Added governance eligibility client helpers and FSFT voting attestation helpers in `frontend/src/lib/contracts.ts`.
- Added Noir contracts:
  - `contracts/fsft_dex` (`FSFTDex`)
  - `contracts/protocol_rewards` (`ProtocolRewards`)
- Added private-holder proof + delegated private-spend interfaces to `contracts/fund_token/src/main.nr`.
- Added parked-capital policy storage/view/setters to `contracts/housing_fund/src/main.nr`.

### Changed
- Added `frontend` npm script `typecheck` (`next typegen && tsc --noEmit --incremental false`) for reliable local TS checks.
- Updated bootstrap/env flow to support recursive verifier VK hashes:
  - `FUND_TOKEN_PRIVATE_HOLDER_VK_HASH`
  - `HOUSING_FUND_VALUATION_VK_HASH`
  - `PROTOCOL_REWARDS_WEIGHTS_VK_HASH`
- Replaced placeholder private-holder attestation with a private proof-gated flow in `FundToken.attest_private_holder` (requires non-zero private FSFT balance before setting eligibility flag).
- Updated rewards attestation route to attempt private-holder proof generation before recording FSFT rewards eligibility.
- Expanded Fund/Rewards/Governance/Portfolio copy to explain what private-holder proofs verify and why they improve trust without exposing balances.
- Expanded simulation seeding to a more active default state:
  - 5 test accounts (`test0..test4`) with mixed investor/KYC profiles
  - pre-seeded FSFT holdings and rewards flags
  - 3 active proposals with 5-minute deadlines and initial voting activity
  - non-empty DEX orderbook + recent trade history
- Updated unknown/generated simulation account defaults to low-friction onboarding (KYC+investor enabled, 25k EUR preload, zero FSFT/FSP).
- Extended rewards stats payloads (simulation + live) with `eligibility` breakdown and actionable `nextSteps`.
- Updated portfolio rewards UX to show bucket-by-bucket FSP eligibility and guided actions.
- Set local Anvil mining cadence to 1-second blocks by default and aligned governance window default to 300 blocks (~5 minutes).
- Rewrote major user-facing copy/tooltips into plain language and switched NAV wording to “estimated share price” in the frontend.
- Expanded `frontend/src/lib/simulationStore.ts` with:
  - Voting eligibility model (investor role + economic fund exposure)
  - FSFT voting/rewards attestations
  - DEX orderbook/trade state and matching flow
  - 10-year protocol rewards emission model (8M pool, monthly epochs)
  - Portfolio and fund outputs including protocol token and lock fields
- Updated governance vote API (`frontend/src/app/api/governance/vote/route.ts`) to enforce economic voting eligibility in live mode:
  - Investor role required
  - Plus deposit ticket or FSFT holding required
- Updated governance page (`frontend/src/app/governance/page.tsx`) to use explicit eligibility checks and user-facing reasons before vote submission.
- Updated proposal card copy to reflect expanded voting requirements.
- Updated invest/fund overview messaging to explain protocol-managed parked EUR allocation in DeFi while idle.
- Updated portfolio page with protocol rewards distribution panel and claim/attest actions.
- Redesigned KYC flow/page visuals to align with current card-based UI language and deterministic dev-mode handling.
- Extended live/simulation API payloads for fund and portfolio with additional v3-facing fields.
- Wired live-mode rewards routes (`/api/rewards/stats`, `/api/rewards/claim`, `/api/rewards/attest`) to `ProtocolRewards`.
- Wired live-mode DEX routes (`/api/dex/orders`, `/api/dex/match`, `/api/dex/cancel`) to `FSFTDex`.
- Extended live governance eligibility/vote checks to include private-holder proof path.
- Updated bootstrap to compile/deploy/wire `FSFTDex`, `ProtocolRewards`, and `PROTOCOL_TOKEN`.
- Added `housing_fund.get_valuation_public()` and updated `FSFTDex` to consume it for NAV-band checks.
- Refactored `ProtocolRewards` epoch targeting logic to Aztec-compatible public/view patterns and added `get_epoch_target`.
- Made zkPassport dev-mode request IDs deterministic by address for stable simulation/live parity.
- Expanded KYC/fund/portfolio API payloads with explicit DEX/rewards/vote-eligibility metadata fields.
- Updated simulation mode gating to support local runs via `AZTEC_SIMULATION=true` / `NEXT_PUBLIC_SIMULATION=true` (not only Vercel).
- Switched `FSFTDex.match_order` to private settlement with delegated private-note transfers and a public `only_self` finalizer (`_apply_match_fill`) that enforces all matching invariants.
- Replaced governance deposit exposure attestation with explicit on-chain deposit-ticket synchronization from `HousingFund` via `Governance.sync_deposit_ticket`.
- Tightened simulation DEX parity to enforce investor-only match/cancel permissions, taker-owner-only matching, and maker-price settlement.

### Breaking
- `Governance.constructor` now requires `fund_token` as an additional argument.
- `FSFTDex.constructor` now requires `fsft_token` and `eur_token` addresses.
- `FSFTDex.match_order` signature changed to private settlement args (`fill_amount`, `eur_amount`, `buyer`, `seller`) and now finalizes state through `only_self`.
- New bootstrap/env contract keys are required for full live v3 flow:
  - `NEXT_PUBLIC_FSFT_DEX_ADDRESS`
  - `NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS`
  - `NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS`

### Docs
- Added this `CHANGELOG.md` and backfilled historical releases.

## [2026-02-26] - Governance + Investor Role + NAV v2

### Added
- Investor role tracking in KYC (`is_investor`) and role propagation in API/UI.
- Governance quorum support (`min_quorum_votes`) with enforceable finalize checks.
- Permissionless settlement path:
  - `governance.execute_proposal`
  - `housing_fund.open_distribution`
  - `housing_fund.claim_distribution`
- Distribution utility getters:
  - `get_claimable_amount`
  - `has_claimed`
  - `get_distribution_status`
- New governance claim API route: `POST /api/governance/claim`.

### Changed
- Proposal execution no longer uses backend-admin reserve/mint loops.
- Bootstrap wiring updated to transfer FSFT admin to HousingFund for claim-driven mint flow.
- Simulation parity updated for investor-role gating and distribution claims.
- UI updated to NAV-centric FSFT framing (no fixed 1 EUR peg claim).

## [2026-02-25] - Devnet Reliability + UX Consolidation

### Added
- Multi-account wallet UX and shared wallet context.
- EUR token-first flow across APIs and UI.
- Tooltips and explanatory UX on invest/governance/portfolio views.
- Runtime-safe Aztec artifact loading and server wallet patterns.

### Changed
- Reworked API mode behavior between simulation and live paths.
- Refined governance/proposal route behavior and simulation handling.
- Improved portfolio and fund stats wiring for live reads.
- Updated global styling, typography, and layout consistency.

### Fixed
- Aztec subpath import issues (`@aztec/aztec.js` runtime and bundling pitfalls).
- Build/runtime issues around embedded wallet server-side usage.
- Vercel/local mode split and env handling for predictable deploy behavior.
- zkPassport v0.12 compatibility path and status polling safety.

## [2026-02-24] - Initial Noir Prototype and Infrastructure Base

### Added
- Initial Fair Squares Noir contracts and local Aztec stack wiring.
- Docker-compose orchestration for Anvil + Aztec + bootstrap + frontend.
- Bootstrap compile/deploy/wiring script and generated env/address flow.
- Initial dashboard/invest/governance/portfolio/KYC pages.

### Changed
- Multiple bootstrap and deployment iterations for Aztec v4 compatibility.
- Theme and UI redesign passes to align with Fair Squares visual direction.

### Fixed
- Noir/Aztec migration issues (imports, storage macros, deployment flags).
- AVM transpilation/codegen integration and artifact compatibility adjustments.
- Healthchecks and inter-container networking in local stack.
