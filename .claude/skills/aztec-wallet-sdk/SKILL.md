---
name: aztec-wallet-sdk
description: Use this skill when integrating Aztec wallet connectivity with @aztec-labs/wallet-sdk, including discovery/session flows, secure-channel key exchange, extension handlers, encrypted messaging, and BaseWallet implementations.
license: Proprietary. LICENSE.txt has complete terms
compatibility: Pinned to aztec v6.0.0 (aztec-labs-eng/aztec-node commit d2e67c1d938f06a6476dd7d4bd01e73771923dd1; aztec-nr at aztec-labs-eng/aztec-nr commit 46d118ff7ad04d80da716a8c7368377bb9a9d21d).
metadata:
  version_label: v6.0.0
  commit_sha: d2e67c1d938f06a6476dd7d4bd01e73771923dd1
  source_map: aztec-packages/yarn-project/wallet-sdk
---

# Aztec Wallet SDK Integration

## Overview

Use this skill for wallet connectivity and wallet-provider implementation work with `@aztec-labs/wallet-sdk`.

Primary scope:

- dApp wallet discovery with `WalletManager`
- secure channel establishment (`PendingConnection`, key exchange, verification hash)
- extension-specific provider usage (`ExtensionProvider`, `ExtensionWallet`)
- extension relay handlers (`BackgroundConnectionHandler`, `ContentScriptConnectionHandler`)
- encrypted message protocol and session lifecycle handling
- wallet implementation extension via `BaseWallet`

Out of scope:

- Noir/Aztec.nr contract authoring (use `aztec-contracts`)
- contract deployment workflows (use `aztec-deployment`)
- broad Aztec.js app development beyond wallet-connection concerns (use `aztec-js`)

## Required Repository State

Use the upstream repository and pin:

- Repo: `https://github.com/aztec-labs-eng/aztec-node`
- Tag: `v6.0.0`
- Commit: `d2e67c1d938f06a6476dd7d4bd01e73771923dd1`
- Source root: `yarn-project/wallet-sdk`

Checkout example:

```bash
git clone https://github.com/aztec-labs-eng/aztec-node.git
cd aztec-packages
git checkout v6.0.0
git status
```

Expected status includes `HEAD detached at v6.0.0`.

## Operating Rules

- Follow the two-phase protocol strictly: discovery first, then key exchange.
- Do not call wallet methods until `PendingConnection.confirm()` succeeds.
- Treat verification-hash comparison as mandatory before confirming a connection.
- Keep extension private keys and derived session keys in background context only.
- Keep content scripts as message relays only; no crypto or session-key state there.
- Handle disconnect control messages (`WalletMessageType.DISCONNECT`) and cleanup all in-flight requests.
- Use explicit `chainInfo` and `appId` on discovery and message flows.
- Respect allow/block list policies when exposing extension wallets.
- For custom wallet implementations, extend `BaseWallet` and implement account lookup and capability behavior explicitly.

## Quick Start

```bash
# Install core SDK deps (choose one package manager)
scripts/install_wallet_sdk_deps.sh npm
```

```typescript
import { Fr } from '@aztec-labs/aztec.js/fields';
import { WalletManager } from '@aztec-labs/wallet-sdk/manager';
import { hashToEmoji } from '@aztec-labs/wallet-sdk/crypto';

const discovery = WalletManager.configure({
  extensions: { enabled: true },
}).getAvailableWallets({
  chainInfo: { chainId: new Fr(31337), version: new Fr(1) },
  appId: 'my-dapp',
  timeout: 60000,
});

for await (const provider of discovery.wallets) {
  const pending = await provider.establishSecureChannel('my-dapp');
  console.log('Verify:', hashToEmoji(pending.verificationHash));
  const wallet = await pending.confirm();
  const accounts = await wallet.getAccounts();
  console.log(accounts);
}
```

## Core Workflows

### 1. Discover Wallet Providers (dApp Side)

- Configure manager with `WalletManager.configure({ extensions: { enabled: true } })`.
- Start discovery with `getAvailableWallets({ chainInfo, appId, timeout, onWalletDiscovered? })`.
- Consume discovered providers using either:
- async iteration via `discovery.wallets`
- callback via `onWalletDiscovered`
- Cancel discovery on route/network changes via `discovery.cancel()`.

### 2. Establish and Verify Secure Channel

- Call `provider.establishSecureChannel(appId)`.
- Display `pending.verificationHash` using `hashToEmoji(...)`.
- Require user confirmation that wallet UI and dApp UI match.
- Call `pending.confirm()` only after user confirmation.
- Call `pending.cancel()` if verification fails.

### 3. Use Low-Level Extension Provider (When Needed)

- Use `ExtensionProvider.discoverWallets(chainInfo, options)` when bypassing manager abstractions.
- Handle `DiscoveredWallet` entries through `onWalletDiscovered` callback.
- Promote a discovered wallet to connected state with `discovered.establishSecureChannel()`.
- Enforce key exchange timeout handling and retry policy.

### 4. Implement Extension Wallet Transport

Background script:

- Instantiate `BackgroundConnectionHandler(config, transport, callbacks)`.
- Call `initialize()` once.
- All `BackgroundConnectionCallbacks` fields are optional:
  - `onPendingDiscovery` — queues approval UI for incoming discovery requests.
  - `onSessionEstablished` — notified when key exchange completes and a session is live.
  - `onSessionTerminated` — notified when a session ends (disconnect or tab close).
  - `onWalletMessage` — receives decrypted wallet calls; call `sendResponse` with result.
- On user approval/rejection, call `approveDiscovery(requestId)` or `rejectDiscovery(requestId)`.
- Forward decrypted wallet calls from `onWalletMessage` to wallet backend.
- Return encrypted responses through `sendResponse(sessionId, walletResponse)`.
- Declare `handler` with `let` before defining callbacks that reference it (avoids temporal deadzone).

Content script:

- Instantiate `ContentScriptConnectionHandler(transport)`.
- Call `start()` once.
- Relay discovery, key exchange, encrypted messages, and disconnect notifications.

### 5. Encrypted Protocol and Message Types

- Discovery/control types use `WalletMessageType`:
- `DISCOVERY`
- `DISCOVERY_RESPONSE`
- `KEY_EXCHANGE_REQUEST`
- `KEY_EXCHANGE_RESPONSE`
- `DISCONNECT`
- Use `generateKeyPair`, `exportPublicKey`, `importPublicKey`, `deriveSessionKeys` for key exchange.
- Use `encrypt`/`decrypt` for all post-handshake payloads.
- Keep request correlation by `requestId`/`messageId` and validate `walletId` on responses.

### 6. Build Custom Wallets with `BaseWallet`

- Extend `BaseWallet` for wallet implementations backed by PXE + Aztec node.
- Implement:
- `getAccountFromAddress(address)`
- `getAccounts()`
- Use built-ins for common wallet operations:
- `simulateTx`, `profileTx`, `sendTx`
- `registerContract`, `registerSender`
- `createAuthWit`, `getPrivateEvents`
- `getContractMetadata`, `getContractClassMetadata`
- Override capabilities handling with `requestCapabilities(...)` for external wallets.
- `BaseWallet.sendTx` returns `{ receipt?, txHash?, offchainEffects, offchainMessages }`. Custom `Wallet` / `BaseWallet` implementations must call `extractOffchainOutput(provenTx.getOffchainEffects(), provenTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp)` (the anchor-block timestamp argument is mandatory in v6.0.0) and spread the result into the returned object — the `OffchainMessage.anchorBlockTimestamp` field added in this release is set from that argument.

### 7. Session Lifecycle and Disconnect Handling

- Register disconnect hooks via `provider.onDisconnect(callback)` — returns an unsubscribe function.
- Check `provider.isDisconnected()` to test current session state without polling.
- On disconnect, clear app state and stop using prior wallet handles.
- Call `provider.disconnect()` on app shutdown or wallet switch.
- In background handler, terminate stale sessions with `terminateSession(...)`/`terminateForTab(...)`/`clearAll()`.

### 8. Test and Validation Flow

- Use wallet-sdk unit tests in `yarn-project/wallet-sdk/src/**/*.test.ts` as behavior references.
- Validate mixed simulation path behavior and private-event decoding patterns from `base_wallet.test.ts`.
- Add integration checks for:
- discovery timeout behavior
- key exchange timeout (`2s` in `DiscoveredWallet`)
- disconnect propagation and in-flight rejection handling

## Tooling / Commands

```bash
# preflight checks (node + package manager + optional node URL + optional source path)
scripts/preflight_wallet_sdk.sh [node-url] [wallet-sdk-dir]

# install wallet-sdk dependencies
scripts/install_wallet_sdk_deps.sh <npm|yarn|pnpm> [version]

# run a TS wallet-sdk example with tsx (tsx must be installed: npm install -D tsx)
scripts/run_wallet_sdk_example.sh <entry-file.ts> [-- <extra-args...>]

# summarize package entrypoints/exports from aztec-packages checkout
scripts/summarize_wallet_sdk_exports.sh <aztec-packages-dir>

# run wallet-sdk package tests from aztec-packages checkout
scripts/run_wallet_sdk_tests.sh <aztec-packages-dir> [test-name-pattern]
```

## Edge Cases and Failure Handling

- Wallet discovery yields no providers:
check user approval path and discovery timeout (default `60000ms`).
- Key exchange fails with timeout:
`DiscoveredWallet.establishSecureChannel()` enforces a `2000ms` timeout; retry from approved discovery state.
- Verification hash mismatch:
cancel the pending connection and do not call `confirm()`.
- Wallet responses ignored unexpectedly:
validate `walletId`, `messageId`, and per-session routing state.
- Calls fail after disconnect:
expected; `ExtensionWallet` rejects in-flight and future calls once disconnected.
- Extension appears in discovery but not manager output:
check `allowList`/`blockList` filtering in manager config.
- `PendingDiscovery.appName` is always `undefined` at this pin:
`DiscoveryRequest` does not carry an `appName` field, so `BackgroundConnectionHandler` never populates it. Do not rely on it for UI labelling; use `appId` and `origin` instead.

## Next Steps / Related Files

- Use `reference.md` for pinned source corpus and API/file map.
- Use `patterns.md` for reusable dApp and extension integration snippets.
- Use `scripts/` for repeatable setup, inspection, and test workflows.

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
