---
name: aztec-pxe
description: Use this skill when implementing or debugging direct PXE workflows in TypeScript, including private execution lifecycle, note discovery/synchronization, sender/recipient tagging, private events, scopes, and oracle/debug checks.
license: Proprietary. LICENSE.txt has complete terms
compatibility: Pinned to aztec v6.0.0 (aztec-labs-eng/aztec-node commit d2e67c1d938f06a6476dd7d4bd01e73771923dd1; aztec-nr at aztec-labs-eng/aztec-nr commit 46d118ff7ad04d80da716a8c7368377bb9a9d21d).
metadata:
  version_label: v6.0.0
  commit_sha: d2e67c1d938f06a6476dd7d4bd01e73771923dd1
  source_map: aztec-packages/yarn-project/pxe
---

# PXE Private Execution Operations

## Overview

Use this skill for direct `@aztec-labs/pxe` work.

Primary scope:

- private execution lifecycle (`simulateTx`, `profileTx`, `proveTx`, `executeUtility`)
- note discovery/synchronization behavior and scope control
- sender/recipient tagging workflows
- private event retrieval and filter handling
- oracle compatibility checks and PXE debug helpers

Out of scope:

- Noir/Aztec.nr contract authoring (use `aztec-contracts`)
- generic Aztec.js app flows that do not need direct PXE control (use `aztec-js`)
- deployment-focused procedures (use `aztec-deployment`)

## Required Repository State

Use the upstream repository and pin:

- Repo: `https://github.com/aztec-labs-eng/aztec-node`
- Tag: `v6.0.0`
- Commit: `d2e67c1d938f06a6476dd7d4bd01e73771923dd1`
- Source root: `yarn-project/pxe`

Checkout example:

```bash
git clone https://github.com/aztec-labs-eng/aztec-node.git
cd aztec-packages
git checkout v6.0.0
git status
```

Expected status includes `HEAD detached at v6.0.0`.

## Operating Rules

- Treat PXE as a serialized execution environment: high-level jobs are queued and run one-at-a-time.
- Always pass an explicit `scopes: AztecAddress[]` list; the `'ALL_SCOPES'` sentinel was removed. To emulate the old "see everything" behavior, pass the enumerated list of registered addresses: `scopes = (await pxe.getRegisteredAccounts()).map(a => a.address)`.
- Capsule access is enforced at the PXE level in v6.0.0: a contract touching capsules scoped to an address not in the tx's `scopes` list fails at runtime with `Scope 0x… is not in the allowed scopes list: [...]`. `AztecAddress::zero()` is always permitted (global scope).
- Register recipient accounts with `registerAccount(...)` before expecting note or private event visibility.
- Register counterpart senders with `registerSender(...)` when syncing tagged logs across peers.
- Use `simulateTx` before `proveTx`; only prove after simulation and sync checks pass.
- For private events, `filter.scopes` must be non-empty and block range follows `[fromBlock, toBlock)`.
- Use `debug.getNotes(...)` only for diagnostics; prefer contract utility functions for production reads.
- If oracle interface changes, run oracle version checks before trusting cross-version simulations.

## Quick Start

```bash
# install dependencies in your app
scripts/install_pxe_deps.sh npm

# check node reachability + optional pxe source path validation
scripts/preflight_pxe.sh http://localhost:8080 /path/to/aztec-packages/yarn-project/pxe
```

```typescript
import { createAztecNodeClient, waitForNode } from '@aztec-labs/aztec.js/node';
import { createPXE, getPXEConfig } from '@aztec-labs/pxe/server';

const node = createAztecNodeClient('http://localhost:8080');
await waitForNode(node);

const pxe = await createPXE(node, getPXEConfig(), {
  loggerActorLabel: 'app-pxe',
});
```

## Core Workflows

### 1. Boot PXE and Anchor State 

- Build node client and wait for JSON-RPC readiness.
- Create PXE via `createPXE(...)` from `@aztec-labs/pxe/server` or `@aztec-labs/pxe/client/lazy`.
- Use `getSyncedBlockHeader()` to confirm the current anchor block before execution.

### 2. Register Accounts, Senders, and Contract Data

- Register account recipients via `registerAccount(secretKey, partialAddress)`.
- Register known counterpart senders via `registerSender(senderAddress)`.
- Register artifacts/instances via `registerContractClass(...)` and `registerContract(...)`.
- Verify registration with `getRegisteredAccounts()`, `getSenders()`, `getContractInstance()`.

### 3. Run Private Execution Lifecycle

- `simulateTx(txRequest, opts)` for private (and optional public) simulation.
  - `opts.overrides?: SimulationOverrides` injects simulation-time contract instances/artifacts (useful for testing).
- `profileTx(txRequest, { profileMode, scopes })` for execution/gate diagnostics.
  - `profileMode` values: `'full'` | `'execution-steps'` | `'gates'`.
- `proveTx(txRequest, scopes)` only after simulation correctness is confirmed.
  - Returns `TxProvingResult`; `publicInputs` is non-optional on the result.
- `executeUtility(functionCall, { authwits, scopes })` for utility paths and sync-state calls.

### 4. Note Discovery and Synchronization

- PXE sync occurs before simulation/event operations; keep one execution flow per state transition.
- Contract sync is scope-aware; `[]` scopes deny access and skip sync.
- Use `debug.sync()` to force an explicit sync checkpoint when diagnosing stale state.
- Use `debug.getNotes({ contractAddress, owner?, storageSlot?, status?, siloedNullifier?, scopes })` for note-level diagnostics.

### 5. Tagging (Sender / Recipient)

- Sender-side index progression is maintained per directional secret `(sender, recipient, contract)`.
- Recipient-side log loading scans bounded windows of tagging indexes and updates aged/finalized indices.
- Registering sender addresses improves recipient decryption coverage for incoming private logs.
- If tags are reused unexpectedly, inspect pending/finalized index movement and tx inclusion timing.

### 6. Private Events

- Retrieve private events via `getPrivateEvents(eventSelector, filter)`.
- Required filter fields:
- `contractAddress`
- `scopes` (non-empty)
- Optional filters: `txHash`, `fromBlock`, `toBlock` (`toBlock` exclusive).
- If events are missing, ensure account registration, scope inclusion, and anchor sync point.

### 7. Oracle and Debug Workflows

- Verify oracle compatibility with `scripts/check_oracle_version.sh` against your pinned `aztec-packages` checkout.
- Use `utilityLog` outputs and simulation traces (`profileTx`) to localize oracle call failures.
- Treat `PXEDebugUtils` APIs as unstable and diagnostics-only.

### 8. Shutdown and Resource Hygiene

- Call `pxe.stop()` on teardown to end queued jobs cleanly.
- Preserve persistent store state across sessions when reproducing note/tagging issues.

## Tooling / Commands

```bash
# preflight node/package manager/source checks
scripts/preflight_pxe.sh [node-url] [pxe-dir]

# install core PXE dependencies
scripts/install_pxe_deps.sh <npm|yarn|pnpm> [version]

# wait for node JSON-RPC readiness
scripts/wait_for_aztec_node.sh <node-url> [timeout-seconds] [interval-seconds]

# run a TypeScript example via tsx
scripts/run_pxe_example.sh <entry-file.ts> [-- <extra-args...>]

# summarize pxe package exports + method surfaces
scripts/summarize_pxe_surface.sh <aztec-packages-dir>

# run @aztec-labs/pxe package tests
scripts/run_pxe_tests.sh <aztec-packages-dir> [test-path-pattern]

# run oracle interface compatibility check
scripts/check_oracle_version.sh <aztec-packages-dir>
```

## Edge Cases and Failure Handling

- `At least one scope is required to get private events`:
provide non-empty `filter.scopes`.
- Missing private notes/events despite successful tx:
verify recipient account registration and scope membership.
- `Incompatible oracle version` error:
run oracle version check and align Aztec.nr/PXE versions.
- Simulations appear stale after chain changes:
force `debug.sync()` and re-run with fresh anchor block.
- Interleaved requests behave unpredictably:
avoid app-side concurrent PXE operation bursts; serialize user flows.
- Tagging sync does not advance:
verify sender registration and inspect finalized/aged tagging index windows.

## Next Steps / Related Files

- Use `reference.md` for source map and API/file coverage.
- Use `patterns.md` for reusable workflow snippets.
- Use `scripts/` for repeatable diagnostics and verification.

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
