# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased] - v3 Protocol Expansion

### Added
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
- Added `frontend/src/app/dex/page.tsx` with investor-only DEX UI, NAV-band messaging, and user order controls.
- Added protocol rewards client types and helper calls in `frontend/src/lib/contracts.ts`.
- Added governance eligibility client helpers and FSFT voting attestation helpers in `frontend/src/lib/contracts.ts`.

### Changed
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
