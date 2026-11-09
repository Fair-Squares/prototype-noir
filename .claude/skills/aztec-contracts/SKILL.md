---
name: aztec-contracts
description: Use this skill when creating, editing, testing, debugging, or upgrading Aztec smart contracts in Noir/Aztec.nr, including storage modeling, private/public/utility functions, note delivery, authwit authorization, TestEnvironment tests, and artifact/codegen workflows.
license: Proprietary. LICENSE.txt has complete terms
compatibility: Pinned to aztec v6.0.0 (aztec-labs-eng/aztec-node commit d2e67c1d938f06a6476dd7d4bd01e73771923dd1; aztec-nr at aztec-labs-eng/aztec-nr commit 46d118ff7ad04d80da716a8c7368377bb9a9d21d).
metadata:
  version_label: v6.0.0
  commit_sha: d2e67c1d938f06a6476dd7d4bd01e73771923dd1
  source_map: aztec-packages/docs/internal_notes/llm_docs_skill_candidates.md
---

# Aztec Contract Development

## Overview

Use this skill for Aztec.nr contract work inside the pinned `aztec-packages` checkout.

Primary scope:

- Contract structure and storage design
- Private/public/utility function design
- Note and private-event delivery mode selection
- Authwit-protected delegated actions
- Compile, test, codegen, debugging, and upgrade flows

## Required Repository State

Use the upstream repository and pin:

- Repo: `https://github.com/aztec-labs-eng/aztec-node`
- Tag: `v6.0.0`
- Commit: `d2e67c1d938f06a6476dd7d4bd01e73771923dd1`

Checkout example:

```bash
git clone https://github.com/aztec-labs-eng/aztec-node.git
cd aztec-packages
git checkout v6.0.0
git status
```

Expected status includes `HEAD detached at v6.0.0`.

## Operating Rules

- Keep implementation aligned with the pinned source set:
- `docs/docs-developers/docs/aztec-nr/**`
- `docs/docs-developers/docs/foundational-topics/contract_creation.md`
- `docs/docs-developers/docs/tutorials/contract_tutorials/**`
- Use GitHub paths when needed:
- `https://github.com/aztec-labs-eng/aztec-node/tree/v6.0.0/docs/docs-developers/docs/aztec-nr`
- Prefer protocol-correct behavior over stylistic churn.
- Keep function intent explicit: execution domain, state domain, and call path.
- Never leave note/event delivery implicit.
- Keep `SKILL.md` procedural; put deep detail in `reference.md` and `patterns.md`.

## Quick Start

```bash
# from a contract crate
aztec compile
aztec test
aztec codegen target --outdir artifacts
```

Use scripts in `scripts/` for the same flows:

- `scripts/new_contract.sh`
- `scripts/build_contract.sh`
- `scripts/test_contract.sh`
- `scripts/codegen_contract.sh`

## Core Workflows

### 1. Contract Scaffold and Structure

- One contract per Noir crate.
- Apply `#[aztec]` to every contract.
- Keep `#[external(...)]` entrypoints directly in the contract block.
- Define one `#[storage]` struct with `Storage<Context>`.
- Put helper/internal logic in internal functions or modules, not external entrypoints.

Baseline pattern:

```rust
use aztec::macros::aztec;

#[aztec]
pub contract MyContract {
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{PublicImmutable, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        admin: PublicImmutable<AztecAddress, Context>,
        value: PublicMutable<Field, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.initialize(admin);
        self.storage.value.write(0);
    }

    #[external("public")]
    fn set_value(value: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "not admin");
        self.storage.value.write(value);
    }

    #[view]
    #[external("public")]
    fn get_value() -> Field {
        self.storage.value.read()
    }
}
```

### 2. State Modeling

- Use `PublicMutable` for mutable public state.
- Use `PublicImmutable` for write-once values readable across contexts.
- Use `DelayedPublicMutable` when private execution must read a public mutable value.
- Use `Owned<PrivateMutable<...>>` and `Owned<PrivateSet<...>>` for per-owner private state.
- Use `SinglePrivateMutable`/`SinglePrivateImmutable` for contract-wide private singleton state.
- Use `Map<K, ...>` for keyed public layouts.

### 3. Function Domain Design

- `#[external("private")]`: private execution and private-state workflows.
- `#[external("public")]`: sequencer-executed public-state workflows.
- `#[external("utility")] unconstrained`: offchain query/helper logic.
- `#[view]`: read-only private/public external functions.
- `#[initializer]`: constructor-like setup.
- `#[noinitcheck]`: only where pre-init calls are explicitly needed. (Do not confuse with `#[allow_phase_change]`, which is a separate phase-check override and is not a replacement for `#[noinitcheck]`.)
- `#[only_self]`: public/private functions only callable by the same contract. In v6.0.0, `#[only_self]` implicitly skips the init check (it behaves as if also marked `#[noinitcheck]`), which means external functions invoked during a private initializer **must** be `#[only_self]`.
- `#[authorize_once("from", "authwit_nonce")]`: delegated actions with replay protection.

### 4. Note/Event Delivery

Whenever a state write or private event returns a message object:

1. Pick delivery mode explicitly.
2. Call `.deliver(...)` or `.deliver_to(...)`.

Delivery selection:

- `MessageDelivery.OFFCHAIN`: cheapest; sender must manually deliver/process offchain messages.
- `MessageDelivery.ONCHAIN_UNCONSTRAINED`: onchain availability, no constrained correctness.
- `MessageDelivery.ONCHAIN_CONSTRAINED`: strongest available guarantees; highest proving cost.

Known caveat in pinned docs/code:

- `ONCHAIN_CONSTRAINED` currently has an acknowledged tag-constraining limitation (issue #14565). Use it when trust assumptions require it, but do not claim perfect guarantees.

### 5. Cross-Contract and Private->Public Flows

- Use `self.call(Other::at(addr).fn(...))` for direct same-domain external calls.
- Use `self.view(...)` for read-only external calls.
- Use `self.enqueue(...)` for private->public deferred execution.
- Use `self.enqueue_self.some_public_fn(...)` plus `#[only_self]` when private logic must safely update public state.
- Do not rely on return values from enqueued public calls in private execution.

### 6. Initialization and Readiness

- Initialization and public deployment are distinct concerns.
- Contracts with public entrypoints usually require class registration plus instance public deployment for public calls.
- Private-only contracts can often operate without public deployment.
- `without_initializer()` plus no `#[initializer]` means initialized-by-design at deploy time.
- `#[noinitcheck]` functions may be callable before initialization. `#[only_self]` functions also implicitly skip the init check in v6.0.0.
- v6.0.0 emits two separate initialization nullifiers (one private, one public). Contracts that expose public functions alongside a private initializer cannot use `skipClassPublication: true` at deploy time, because the public init nullifier is emitted via an auto-enqueued public call that requires the class to be published onchain.

### 7. Authwit

- Use authwit when acting on behalf of another account/owner.
- Prefer `#[authorize_once]` for straightforward delegated call checks.
- Treat nonce handling as mandatory replay protection.
- Use contract accounts in tests when validating authwit workflows.
- Always include negative-path tests (missing/invalid/cancelled authwit).

### 8. Compile, Test, Codegen

Default sequence:

1. `aztec compile`
2. `aztec test`
3. `aztec codegen target --outdir artifacts` (when TS integration is involved)

Rules:

- Use `aztec test` (not `nargo test`) for Aztec contract behavior.
- Recompile before tests because `aztec test` does not auto-recompile changed contracts.
- Treat `target/*.json` as canonical contract artifacts.

### 9. Upgrades

- Initiate upgrades through `ContractInstanceRegistry.update(new_class_id)`.
- Protect upgrade entrypoints with strict authorization.
- Respect delayed activation semantics (`DelayedPublicMutable`-based delay).
- Preserve storage compatibility across versions.
- Re-register updated artifacts in wallets/clients after delay elapses.

## Tooling / Commands

```bash
# Local network debugging
LOG_LEVEL=debug aztec start --local-network

# Compile and test
aztec compile
aztec test

# Generate TypeScript bindings
aztec codegen target --outdir artifacts

# Profile private flows
aztec-wallet profile <function_name> -ca <contract_alias> --args [...] -f <account>

# Gate count report
noir-profiler gates --artifact-path ./target/<artifact>.json --backend-path bb --output ./target
```

Gate-count guidance in pinned docs:

- `< 50k`: excellent
- `50k-200k`: acceptable
- `200k-500k`: consider optimizing
- `> 500k`: optimize before scaling

## Edge Cases and Failure Handling

- `aztec test` failure after edits: rerun `aztec compile` first.
- Public function callable unexpectedly: confirm `#[only_self]` where private->public enqueueing is expected.
- Note recipient cannot use note: verify delivery mode and delivery call were executed.
- Missing authwit behavior in tests: switch to contract accounts and add authwit helper setup.
- Pre-init behavior mismatch: audit `#[initializer]`, `#[noinitcheck]`, and deployment path.
- Upgrade appears ineffective: verify delay elapsed and new artifact registered in wallet/client.
- Utility function misuse: ensure utility functions are only used for unconstrained/offchain workflows.

## Next Steps / Related Files

- Use `reference.md` for pinned source map, implementation matrix, and troubleshooting checklists.
- Use `patterns.md` for reusable code patterns.
- Use scripts in `scripts/` for scaffold/build/test/codegen flows.

## v6.0.0 delta (verified 2026-10-22 while porting this repo from 4.3.0)

The pins above were moved from the `AztecProtocol/aztec-packages` monorepo (v4.2.0)
to the split v6 repos. Everything below was checked against the installed
toolchain / packages, not inferred:

- **Where things live now.** Node + aztec.js + CLI: `aztec-labs-eng/aztec-node`
  (tag `v6.0.0`). Aztec.nr: `aztec-labs-eng/aztec-nr` (same tag; crates at the
  repo root: `aztec`, `uint-note`, `balance-set`, `compressed-string`, `address-note`,
  `field-note`). Protocol circuits / L1 / bb: `AztecProtocol/aztec-packages`
  (aztec-nr v6.0.0 pins `protocol_types` at aztec-packages `v6.0.0`).
- **Nargo.toml:** `aztec = { git = "https://github.com/aztec-labs-eng/aztec-nr", tag = "v6.0.0", directory = "aztec" }`
  (the old `AztecProtocol/aztec-nr` mirror has no v6 tags -> `Remote branch v6.x not found`).
- **npm scopes:** `@aztec/*` -> `@aztec-labs/*` (aztec.js, accounts, wallets, stdlib,
  entrypoints, noir-contracts.js, cli, constants, ...); `@aztec/bb.js`, `noir-*`,
  `l1-artifacts` -> `@aztec-foundation/*`. 6.0.0 final shipped 2026-10-22 (rc tags before it)
  (`npm view @aztec-labs/aztec.js dist-tags` -> latest = 6.0.0 since 2026-10-22; before that only rcs); stable
  `latest` is still 5.2.1 under the OLD `@aztec` scope.
- **Toolchain:** `VERSION=6.0.0 bash -i <(curl -sL https://install.aztec.network/6.0.0)`
  installs via `aztec-up` (native, dockerless). Bundled binaries are `aztec-nargo`,
  `aztec-bb`, `aztec-anvil`, ... (no bare names on PATH). The release docker image is
  now `azteclabs/aztec:6.0.0` and is a pure RUNTIME (node, anvil, cli-wallet,
  `aztec codegen`) with NO nargo/bb: compile on the host, deploy from the container.
- **`aztec compile` output** is final: `transpiled: true`, `aztec_version`, external
  function names (no `__aztec_nr_internals__` prefix) -- no `bb aztec_process` or
  rename post-processing.
- **Networks (docs.aztec.network/networks):** testnet node = `https://aztec-testnet.drpc.org`
  (reports `6.0.0` via `aztec_getNodeInfo`), Sepolia 11155111, SponsoredFPC
  `0x06a9fa0208c78509921b0487a6b5cd5c2e93baf17de1a18d310f65a3cc1d924b`; mainnet (Alpha)
  = `https://aztec-mainnet.drpc.org` on 5.2.0. Testnet is version-locked: node, Aztec.nr
  and aztec.js must match. JSON-RPC methods are `aztec_*` (was `node_*`).
- **Aztec.nr API renames that bit this repo:** `messages::message_delivery` ->
  `messages::delivery`; `MessageDelivery.ONCHAIN_CONSTRAINED` ->
  `MessageDelivery::onchain_constrained()` (same for `onchain_unconstrained()`,
  `offchain()`); `context.push_nullifier` -> `push_nullifier_unsafe`; partial-note
  separators `DOM_SEP__NOTE_COMPLETION_LOG_TAG` / `DOM_SEP__PARTIAL_NOTE_COMMITMENT`
  moved to `aztec::note::partial_note`; `get_public_keys(x).npk_m.hash()` ->
  `get_public_keys(x).npk_m_hash` (the points are gone); `emit_private_log_unsafe`
  takes a `BoundedVec`; note structs declared inside the contract must be `pub`;
  `DelayedPublicMutable` minimum delay 3600 s; history helpers
  `assert_note_was_*` -> `assert_local_note_was_*` (`assert_note_existed_by` unchanged).
  `HintedNote`, `SingleUseClaim`, `PrivateSet`, `Owned`, `#[authorize_once]`,
  `enqueue_self`, `get_anchor_block_header()` are unchanged.
- **Type-complexity limit:** Noir 1.0.0-beta.2x enforces `MAX_TYPE_COMPLEXITY =
  100_000` on the `#[aztec]`-generated `ContractSelfPrivate::new(...)` type of EVERY
  private function; it expands the storage struct and every `Context` occurrence
  (each `Map<_, PublicMutable<_, Context>, Context>` counts the context twice). A
  contract with ~60 state variables overflows; fix by consolidating parallel maps
  into one `Map<_, PublicMutable<Struct, Context>, Context>` -- removing external
  functions does NOT help.
- **Aztec.js:** `AztecAddress.fromString` -> `fromStringUnsafe` (likewise
  `fromBigIntUnsafe` / `fromFieldUnsafe`; `isValid()` to check); test accounts are
  INITIALIZERLESS -> `wallet.createSchnorrInitializerlessAccount(secret, salt,
  signingKey)` (`InitialAccountData.type === "schnorr_initializerless"`);
  `createSchnorrAccount` REQUIRES a signing key (`GrumpkinScalar.random()` from
  `@aztec-labs/aztec.js/fields`) -- the privacy secret is derived from it;
  `Contract.deploy(wallet, artifact, args, ctorName?, { salt, deployer | universalDeploy, publicKeys })`
  then `.send({ from, fee, wait })` resolves `{ contract, instance, receipt }`;
  `ContractDeployer` is gone; `pxe.registerContract(instance)` + `registerContractClass(artifact)`
  (the `wallet.registerContract(instance, artifact)` convenience is unchanged);
  SponsoredFPC artifact: `@aztec-labs/noir-contracts.js/SponsoredFPC`, address via
  `getContractInstanceFromInstantiationParams(artifact, { salt: new Fr(SPONSORED_FPC_SALT) })`
  (`SPONSORED_FPC_SALT` from `@aztec-labs/constants`, = 0) or
  `getSponsoredFPCAddress()` from `@aztec-labs/cli/cli-utils`; `simulate()` still
  returns `{ result, offchainEffects, ... }`; mined receipts keep `executionResult`
  / `hasExecutionReverted()` for post-mining reverts.
- **aztec-wallet (cli):** `--secret-key` -> `--signing-key`; `--payment
  method=fpc-sponsored,fpc=contracts:SponsoredFPC`; `-p/--prover none` (env
  `PXE_PROVER`); `register-contract contracts:SponsoredFPC SponsoredFPC --salt 0`.
- **MCP:** the official `@aztec/mcp-server` (`npx -y @aztec/mcp-server@latest`,
  `AZTEC_DEFAULT_VERSION=v6.0.0`) indexes these repos; wire it in `.mcp.json`.
