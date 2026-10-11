# Prototype interface cleanup

Reviewed the production Home screen at https://proto.fair-squares.nl and current source on 11 October 2026.

## Findings and changes

- Home repeated environment notices, offered competing role actions, and showed two onboarding flows. It now has one housing-focused introduction, one main browse action, and one next action for connected members. Role selection and the detailed journey remain available under “Ways to take part”.
- Empty impact cards and acquisition history crowded the overview. Impact remains available in “Fund facts”; Homes retains its empty acquisition state.
- A shared demo indicator now appears above every page, including mobile. Sample-data and test-network modes both say that no real funds move. Unknown status stays explicitly unknown until the check completes.
- Homes and Portfolio copy is shorter. Unconnected Portfolio no longer displays four empty balance cards. Deposits, claims, withdrawals, votes and trading are unchanged.
- About no longer repeats a marketing hero and problem statement. Financial terms, the calculator, and technical parameters are optional disclosures. Existing privacy, calculator, how-it-works and parameters anchor destinations remain.
- Fund value, rental income and participation rewards remain distinct. The target return uses the supplied fund parameter and is not presented as guaranteed.
- Privacy copy now identifies the prototype’s server-managed test-account boundary, rather than implying privacy from its operator.
- The featured project retains all modelled labels and figures; its summary is shorter. Illustration dimensions prevent layout shifts.

## Verification

- Existing frontend suite: 5 files, 47 tests passed (including lexicon and financial checks).
- Optimized Next.js build, including lint and TypeScript validation: passed with `AZTEC_LIVE=false NEXT_DIST_DIR=.next-verify npm run build`.
- Local Home and About server responses: HTTP 200; new headings and disclosure labels present.
- The first plain TypeScript/build attempt found pre-existing stale `.next/types` entries for retired routes. Verification used a temporary source-scoped tsconfig with the isolated build’s generated types. Tracked configuration files were restored; no build-directory changes are included.
- The managed browser blocked local navigation. Post-change desktop/mobile visual checks and connected-account interactions remain unverified and should be checked on the PR preview. No financial transactions were performed.

## Aztec tooling documentation

Checked https://docs.aztec.network/developers/ai_tooling. The project’s canonical `CLAUDE.md`, referenced by `AGENTS.md`, already covers Aztec compile/test wrappers, strict error handling, version pinning and Poseidon2. The docs additionally emphasize never calling `bb` directly for contract proofs, and recommend version-aware `@aztec/mcp-server` and `noir-mcp-server` for reference lookup. Those servers were not installed as part of this UI-only change. No contract, SDK, network or proving changes are included.
