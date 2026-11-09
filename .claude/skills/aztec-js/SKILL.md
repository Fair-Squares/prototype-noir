---
name: aztec-js
description: Use this skill when building TypeScript applications with Aztec.js, including node/PXE connectivity, account lifecycle, contract deployment and interaction, transaction/fee handling, authwit authorization, event reads, and test automation.
license: Proprietary. LICENSE.txt has complete terms
compatibility: Pinned to aztec v6.0.0 (aztec-labs-eng/aztec-node commit d2e67c1d938f06a6476dd7d4bd01e73771923dd1; aztec-nr at aztec-labs-eng/aztec-nr commit 46d118ff7ad04d80da716a8c7368377bb9a9d21d).
metadata:
  version_label: v6.0.0
  commit_sha: d2e67c1d938f06a6476dd7d4bd01e73771923dd1
  source_map: aztec-packages/docs/internal_notes/llm_docs_skill_candidates.md
---

# Aztec.js Application Development

## Overview

Use this skill for Aztec TypeScript SDK work only.

Primary scope:

- network connection and node readiness
- wallet/account creation, deployment, and registration
- contract deployment and interaction from TypeScript
- transaction send/simulate/profile flows
- fee estimation and fee payment methods
- authwit creation and usage
- public/private event and log reads
- test workflow setup for local-network integration

Out of scope:

- Noir/Aztec.nr contract authoring and architecture
- operator/node/prover infrastructure runbooks
- wallet-provider connectivity / browser-extension transport (use `aztec-wallet-sdk`)

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

- Keep guidance restricted to Aztec.js and related TypeScript SDK packages.
- Prefer subpath imports (for example `@aztec-labs/aztec.js/node`, `@aztec-labs/aztec.js/fields`) over root imports.
- Treat wallet metadata checks as mandatory before first public calls:
- `getContractMetadata(address)` — inspect `initializationStatus` (enum: `INITIALIZED` / `UNINITIALIZED` / `UNKNOWN`), `isContractPublished`
- `getContractClassMetadata(classId)`
- Use explicit `from` (or `NO_FROM` for bypass-entrypoint flows) and explicit fee options on tx-producing calls.
- Bypass-entrypoint sends use `NO_FROM` from `@aztec-labs/aztec.js/account` (the v4.1.x `AztecAddress.ZERO` sentinel was replaced). For multi-call self-deploy + fee-claim flows, wrap with `DefaultMultiCallEntrypoint` + `mergeExecutionPayloads`.
- When deploying a contract that initializes private storage in its constructor (e.g. `SinglePrivateImmutable` / `SinglePrivateMutable`), use contract public keys when the contract owns private state, register the instance with its secret key before send, precompute the instance with the same address inputs the send path will derive (`contractAddressSalt` and `deployer: from`, or no deployer for `universalDeploy`/`NO_FROM`), and pass `additionalScopes: [instance.address]`; otherwise PXE-level scope enforcement rejects the construction-time access to the instance's own private slot. Cross-contract nullification (e.g. escrow withdraw) similarly requires `additionalScopes` listing each foreign address whose notes are nullified.
- Use `simulate` before `send` when validating behavior or gas risk.
- Use `NO_WAIT` only when tx hash persistence and polling are implemented.
- Keep SKILL instructions procedural; place deep API index in `reference.md`.

## Quick Start

```bash
# Install SDK dependencies (choose one package manager)
npm install @aztec-labs/aztec.js @aztec-labs/accounts @aztec-labs/wallets @aztec-labs/noir-contracts.js
# or: yarn add ...
# or: pnpm add ...
```

```typescript
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

const node = createAztecNodeClient("http://localhost:8080");
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node);
```

## Core Workflows

### 1. Connect and Validate Chain Context

- Create node client via `createAztecNodeClient(nodeUrl)`.
- Wait for readiness with `waitForNode(node)`.
- Read `node.getNodeInfo()` and persist chain/version values.
- Register/fetch accounts in wallet before tx usage.

### 2. Create and Deploy Accounts

- Use `wallet.createSchnorrAccount(secret, salt, signingKey?)`.
- Deploy via account deploy method (`getDeployMethod().send({...})`).
- For first deploy of a new account, use a payer that can fund fees.
- Confirm with `wallet.getContractMetadata(accountAddress)`.

### 3. Deploy and Register Contracts (SDK)

- Generate contract TS bindings from compiled artifacts.
- Deploy with `MyContract.deploy(wallet, ...ctorArgs).send({ from })`. Waited deploys return `{ contract, receipt, ... }`.
- Use deploy options when needed:
- `contractAddressSalt`, `universalDeploy`
- `skipClassPublication`, `skipInstancePublication`, `skipInitialization`
- `wait: NO_WAIT`
- Verify readiness with metadata APIs before public interactions.
- Register externally deployed contracts via `wallet.registerContract(...)`.

### 4. Send Transactions Safely

- Build calls from `contract.methods.<fn>(...)`.
- Use `.simulate({ from })` for preflight behavior checks; returns `{ result, ... }`.
- Use `.send({ from, fee?, wait? })` for state changes; waited sends return `{ receipt, ... }`, `NO_WAIT` sends return `{ txHash, ... }`.
- For atomic multi-call flows, use `new BatchCall(wallet, [call1, call2, ...])`. Waited `BatchCall.send()` follows the same return shape (`{ receipt, ... }`).
- If using no-wait mode, poll receipt with node APIs.

### 5. Read Data and Events

- Use `simulate` for typed state reads (private/public/utility); `.simulate()` returns `{ result, ... }`, not the raw value.
- Read public events with `getPublicEvents(node, Contract.events.EventName, filter)`. Returns `{ events, maxLogsHit }`.
- Read private events with `wallet.getPrivateEvents(eventDef, filter)`.
- Use raw logs only when ABI-level decoding is not required.

### 6. Fees and Gas Strategy

- Default method: account pays with Fee Juice.
- Estimate gas with `simulate({ fee: { estimateGas: true } })`.
- Use `GasSettings.fallback({ maxFeesPerGas })` for on-chain sends (replaces v4.1.x `GasSettings.default(...)`). For simulation/estimation use `GasSettings.forEstimation(...)` alongside `skipTxValidation: true`. `EmbeddedWallet.simulateTx` wires the estimation variant automatically.
- Use payment-method classes for supported non-default payment:
- `SponsoredFeePaymentMethod` (local/devnet)
- `FeeJuicePaymentMethodWithClaim` (after bridging Fee Juice from L1)
- Avoid `PrivateFeePaymentMethod` and `PublicFeePaymentMethod`: in v6.0.0 custom-token FPCs are not on the default public setup allowlist, so these methods (and the `fpc-public` / `fpc-private` CLI shortcuts) cannot be used on public/mainnet networks. They remain exported for local/custom-network flows but are deprecated.
- Set explicit gas settings when reliability matters.

### 7. Authwit

- Private authwit: create witness and include in tx `authWitnesses`.
- Public authwit: register/revoke authorization via `SetPublicAuthwitContractInteraction`.
- Arbitrary intent authwit: hash payload and sign as `IntentInnerHash`.
- Treat nonces as mandatory replay protection.

### 8. Testing

- Use a local network and `EmbeddedWallet`/test wallet adapters.
- Use prefunded local accounts for deterministic test setup.
- Use `.simulate()` for assertions and failure-path checks.
- Use `.send()` for integration behavior and receipt-level assertions.

### 9. API Coverage and Discovery

- This skill covers the full available devnet TypeScript API corpus listed in `reference.md`.
- Package-level surface (classes/interfaces/functions/types/enums) is mapped there.
- Use `scripts/api_surface_summary.sh` to re-generate API section counts from pinned docs.

## Tooling / Commands

```bash
# preflight checks for Aztec.js dev env
scripts/preflight_aztec_js.sh http://localhost:8080

# install SDK packages with selected package manager
scripts/install_aztec_js_deps.sh npm

# wait for node JSON-RPC readiness
scripts/wait_for_aztec_node.sh http://localhost:8080

# summarize full API surface from a pinned aztec-packages checkout
scripts/api_surface_summary.sh /path/to/aztec-packages

# run a TS entrypoint via tsx
scripts/run_ts_example.sh ./src/index.ts
```

## Edge Cases and Failure Handling

- `Cannot find the leaf for nullifier` on deploy:
class publication/instance publication settings likely incompatible with call path.
- Contract deploy tx mined but public calls fail:
check `isContractPublished` and class registration metadata.
- `simulate` succeeds but `send` fails:
network-only checks (publication/init/fees) likely missing.
- `Timeout awaiting isMined` or delayed receipts:
handle as pending; poll by tx hash instead of treating as terminal failure.
- Public authwit seems ignored:
verify public authwit registration tx was mined and nonce/action tuple matches.
- Private event read returns empty unexpectedly:
verify `scopes`, caller registration, and block-range filter.

## Next Steps / Related Files

- Use `reference.md` for full API package coverage and method maps.
- Use `patterns.md` for reusable copy-ready Aztec.js snippets.
- Use `scripts/` for repeatable local workflow helpers.

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
