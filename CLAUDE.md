# Aztec Project

This file is the canonical agent guide for this repo. [AGENTS.md](./AGENTS.md) is a stub that points here so Codex (and any other tool that reads `AGENTS.md`) gets the same instructions.

## Critical: Use `aztec` CLI, not `nargo` directly

This is an Aztec smart contract project. Always use the `aztec` CLI wrapper instead of calling `nargo` directly:

- **Compile (full artifact, for deploy)**: `aztec compile` (NOT `nargo compile`). Using `nargo compile` alone produces ACIR without the AVM transpilation + VK generation that the wallet/deploy flow needs.
- **Test**: `aztec test` (NOT `nargo test`).
- **Other nargo commands** like `nargo fmt` and `nargo doc` are fine to use directly.

### Fast iteration loop on the host

For fast typecheck / syntax loops during contract development, the `nargo` binary pinned to the same v4.3.0 build the Docker image ships is installed at `~/.local/bin/nargo`. Use it directly:

```bash
cd contracts/<name> && nargo compile
```

Warm-cache compile is **~3 s per contract** (vs ~10 s per contract through Docker). The host nargo writes its dep cache to `~/nargo/`. For full artifact generation (transpile + VK) you still need `aztec compile` via Docker.

For all-7-contracts compile via Docker, use the persistent nargo cache volume:

```bash
docker run --rm --entrypoint /bin/bash \
  -v aztec-nargo-cache:/root/nargo \
  -v "$PWD:/workspace" \
  aztecprotocol/aztec:4.3.0 -lc '
    export PATH=/usr/src/noir/noir-repo/target/release:$PATH
    for c in kyc_verifier fund_token defi_vault governance housing_fund fsft_dex protocol_rewards; do
      cd /workspace/contracts/$c && rm -rf target
      node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js compile \
        2>&1 | grep -E "^error:|Compilation complete"
    done'
```

The named `aztec-nargo-cache` volume persists git deps across runs (~1 min full-suite vs 12 min cold).

## Error Handling

- NEVER silently swallow errors or fall back to default values. If a value is required, throw if it's missing.
- NEVER use fallback values like `AztecAddress.ZERO`, `"unknown"`, `0`, or `null` to mask missing data. These hide bugs and cause failures elsewhere that are harder to trace.
- NEVER add retry/polling logic unless explicitly asked. Retry loops with long timeouts may brick application loops and mask the real error.
- NEVER wrap calls in try/catch that returns null or a default. Let errors propagate.
- If a precondition isn't met, throw immediately with a descriptive message -- don't try to "work around" it.
- Prefer `T` return types over `T | null` when null would indicate a bug rather than a valid state.
- Do not add `.catch(() => defaultValue)` to promises. If something fails, the caller needs to know.

## Version Compatibility

The Aztec developer SDK/aztec-nr version (used for writing and compiling contracts) may differ from the node version (used by operators to run the network). Check the [Networks page](https://docs.aztec.network/networks) for current network versions. When in doubt, use the version from the developer docs you are reading -- it is the correct SDK version for contract development on that network.

## Hashing: Default to Poseidon2

When writing Aztec.nr contract code that requires hashing, **always use Poseidon2** unless a specific protocol or interoperability requirement calls for a different hash.

- **Default**: `use aztec::protocol::hash::poseidon2_hash;`
- **Do NOT** default to Pedersen (`pedersen_hash`). Pedersen is available but Poseidon2 is cheaper in circuits and is the standard across Aztec.
- If you are unsure which hash to use, use Poseidon2.

## Testnet smoke test

To verify the pinned `@aztec/aztec.js` (v4.3.0) talks to the public Aztec testnet:

```bash
cd scripts
AZTEC_NETWORK=testnet npx tsx smoke-testnet.ts
```

Expected output: chain_id 11155111 (Sepolia), a current block number, and a non-zero version field. Anything else means PXE quota / version mismatch.

Full testnet deploy (SponsoredFPC + Schnorr account + all 7 contracts via TS SDK) is Stage 6.5; see scripts/smoke-testnet.ts comments for the next-milestones checklist.

## Adding `aztec test` coverage (Task 22)

Pattern lives in `noir-projects/noir-contracts/contracts/test/public_immutable_contract/src/main.nr` in the aztec-packages clone: a `mod tests { ... }` block inside the same file with `TestEnvironment::new()` + `env.deploy(...)` + `env.call_public(...)` / `env.call_private(...)`. Host nargo runs tests in ~5 s per contract. The order to add:

1. KYCVerifier — issue → owner-can-prove-existence happy path; revoke → existence still proves but `is_credential_revoked` flips true.
2. HousingFund — deposit_private → DepositNote present in caller's set; total_deposits aggregate bumps.
3. Governance — cast_vote_private happy path; double-vote rejected (SingleUseClaim).
4. ProtocolRewards — allocate_reward_private → RewardClaimNote present; claim_reward_private consumes and re-claim rejected.
5. FSFTDex — place_order_private → commitment OPEN; cancel_order_private flips to CANCELLED.

## Frontend design system

Use the type scale defined in `frontend/src/app/globals.css` and the primitives in `frontend/src/components/SimplePage.tsx`. Do not invent new sizes per page.

- Single font: Plus Jakarta Sans (400 / 500 / 600 / 700).
- Four sizes: page title (h1 / `.text-display` 28px), section heading (h2 / `.text-heading` 18px), body (16px default), meta (`.text-meta` 14px).
- Single card style: `rounded-2xl border border-border bg-card p-5`.
- Reuse `PageHero`, `MetricRow`, `PrimaryCard`, `ActionPanel`, `AdvancedDetails` instead of building per-page chrome.
