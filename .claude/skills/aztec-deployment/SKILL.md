---
name: aztec-deployment
description: Use this skill when deploying Aztec smart contracts (not authoring them), including local-network and devnet deployment via aztec-wallet/Aztec.js, fee-payment setup, deterministic addresses, deployment verification, and contract registration workflows.
license: Proprietary. LICENSE.txt has complete terms
compatibility: Pinned to aztec v6.0.0 (aztec-labs-eng/aztec-node commit d2e67c1d938f06a6476dd7d4bd01e73771923dd1; aztec-nr at aztec-labs-eng/aztec-nr commit 46d118ff7ad04d80da716a8c7368377bb9a9d21d).
metadata:
  version_label: v6.0.0
  commit_sha: d2e67c1d938f06a6476dd7d4bd01e73771923dd1
  source_map: aztec-packages/docs/internal_notes/llm_docs_skill_candidates.md
---

# Aztec Contract Deployment

## Overview

Use this skill for contract deployment lifecycle work only:

- choosing deployment mode (class registration, instance publication, initialization)
- deploying with `aztec-wallet` (local network or devnet)
- deploying with Aztec.js (`deploy()`, `deployWithOpts()`, deployment options)
- fee payment setup (fee juice or sponsored FPC)
- deterministic deployment (salt / universal deploy)
- deployment verification and post-deploy registration

Out of scope:

- contract implementation/design (use `aztec-contracts`)
- node/sequencer/prover operations

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

- Treat deployment as four independent switches: class registration, instance publication, initialization, and wallet registration.
- Never assume a contract is callable after tx inclusion; verify metadata states.
- For contracts with public functions, require class registration + instance publication.
- Use `--payment` explicitly on devnet.
- Use `--no-wait` only when tx tracking and retry logic are in place.
- Keep this skill deployment-only; avoid contract authoring advice here.
- `skipClassPublication: true` (CLI `--no-class-registration`) cannot be used for contracts that combine public functions with a private initializer: v6.0.0 emits a separate public init nullifier via an auto-enqueued public call, which requires the class to be published onchain.
- When deploying a contract that initializes private storage in its constructor (e.g. `SinglePrivateImmutable` / `SinglePrivateMutable`), use contract public keys when the contract owns private state, register the instance with its secret key before send, precompute the instance with the same address inputs the send path will derive (`contractAddressSalt` and `deployer: from`, or no deployer for `universalDeploy`/`NO_FROM`), and pass `additionalScopes: [instance.address]` on the Aztec.js deploy options so PXE scope enforcement permits the constructor's access to the instance's own private slot. `DeployAccountMethod` already injects the account address automatically; custom account deploy flows must preserve that behavior. Cross-contract nullification (e.g. an escrow withdraw tx) likewise requires `additionalScopes` listing every address whose notes are nullified.

## Quick Start

Local network (CLI):

```bash
aztec start --local-network
aztec-wallet import-test-accounts
aztec-wallet deploy token_contract@Token --args accounts:test0 Test TST 18 -f test0 -a token
aztec-wallet get-tx
```

Devnet (CLI, sponsored fees):

```bash
export NODE_URL=https://devnet.aztec-labs.com/
export SPONSORED_FPC_ADDRESS=0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97

aztec-wallet register-contract \
  --node-url "$NODE_URL" \
  --alias sponsoredfpc \
  "$SPONSORED_FPC_ADDRESS" SponsoredFPC --salt 0

aztec-wallet create-account \
  --node-url "$NODE_URL" \
  --alias my-wallet \
  --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS

aztec-wallet deploy \
  --node-url "$NODE_URL" \
  --from accounts:my-wallet \
  --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
  --alias token \
  token_contract@Token \
  --args accounts:my-wallet Token TOK 18 --no-wait
```

## Core Workflows

### 1. Preflight and Environment Selection

Local network:

- start `aztec start --local-network`
- use `aztec-wallet import-test-accounts`
- default fee method is usually `fee_juice`

Devnet:

- set `NODE_URL`
- register sponsored FPC in wallet
- create account with `--payment method=fpc-sponsored,fpc=<fpc-address>`
- expect slower blocks and occasional wait timeouts

### 2. Artifact Selection

Accepted artifact inputs for `aztec-wallet deploy`:

- package selector: `token_contract@Token`
- artifact file path: `./target/my_contract-MyContract.json`

Constructor args must match the selected initializer ABI.

### 3. Standard Deploy (CLI)

Base command:

```bash
aztec-wallet deploy <artifact> \
  --from <account> \
  --args <constructor-args...> \
  --alias <contract-alias>
```

Common options:

- `--init <fn>` to select a non-default initializer
- `--no-init` to skip constructor execution
- `--salt <hex>` for deterministic address
- `--universal` to remove sender from address derivation
- `--no-class-registration` to skip class publication
- `--no-public-deployment` to skip instance publication
- `--no-wait` to return tx hash immediately

### 4. Devnet Sponsored Deployment

For each fee-paying command, include:

```text
--payment method=fpc-sponsored,fpc=<sponsored-fpc-address>
```

Minimal safe sequence:

1. register sponsored FPC in wallet
2. create account with sponsored payment
3. deploy contract with same payment method
4. check tx/receipt status and verify contract metadata

### 5. Aztec.js Deployment

Canonical pattern:

```typescript
const { contract } = await MyContract.deploy(wallet, ...ctorArgs).send({ from });
```

Deployment options in `send(...)` include:

- `contractAddressSalt`
- `universalDeploy`
- `skipClassPublication`
- `skipInstancePublication`
- `skipInitialization`
- `wait` (including `NO_WAIT`)

Waited deploys return `{ contract, receipt, ... }`. `NO_WAIT` deploys return `{ txHash, ... }`.

Advanced:

- `deployWithOpts({ wallet, method: "public_constructor" }, ...args)`
- `deployMethod.getInstance({ contractAddressSalt, deployer })` for predicted address
- `deployMethod.register()` before batching deployment + call

### 6. Verification and Readiness Checks

Use wallet metadata checks after deployment:

```typescript
import { ContractInitializationStatus } from "@aztec-labs/aztec.js/wallet";

const metadata = await wallet.getContractMetadata(contractAddress);
metadata.instance;
metadata.initializationStatus; // ContractInitializationStatus: INITIALIZED | UNINITIALIZED | UNKNOWN
metadata.isContractPublished;
```

Also verify class state:

```typescript
const classMeta = await wallet.getContractClassMetadata(metadata.instance!.currentContractClassId);
classMeta.isContractClassPubliclyRegistered;
```

Interpretation:

- Public calls require `isContractPublished = true`.
- Contracts with init-guarded functions require `metadata.initializationStatus === ContractInitializationStatus.INITIALIZED`. `UNKNOWN` means the instance is not registered in this wallet, so initialization cannot be determined — register the instance first.
- Public-function deployments require class registration.

### 7. External Contract Registration

If contract is deployed by another actor:

1. get metadata from node/wallet
2. register contract instance + artifact in wallet
3. if node cannot provide full instance data, reconstruct from deployment params

### 8. Transaction Handling

- Prefer synchronous waits for critical deploys.
- Use `--no-wait` or `NO_WAIT` only when you persist tx hash and poll receipts.
- On devnet, handle `"Timeout awaiting isMined"` as non-final; poll via `get-tx`/node APIs.

### 9. Local-to-Devnet Migration

- Replace local URL with devnet URL.
- Remove assumptions about pre-funded test accounts.
- Add explicit payment strategy (`--payment ...`) to all tx-producing commands.
- Increase timeout/retry budgets.

## Tooling / Commands

```bash
# Local network
aztec start --local-network
aztec-wallet import-test-accounts

# Deploy
aztec-wallet deploy <artifact-or-package@contract> --from <account> --args <...> -a <alias>

# Devnet fee payment
aztec-wallet register-contract --node-url "$NODE_URL" --alias sponsoredfpc <FPC_ADDRESS> SponsoredFPC --salt 0
aztec-wallet create-account --node-url "$NODE_URL" --alias my-wallet --payment method=fpc-sponsored,fpc=<FPC_ADDRESS>

# Tx inspection
aztec-wallet get-tx
aztec-wallet get-tx <tx-hash>
```

Use scripts in `scripts/` for repeatable flows:

- `scripts/preflight_deploy.sh`
- `scripts/register_sponsored_fpc.sh`
- `scripts/create_devnet_account.sh`
- `scripts/deploy_contract_wallet.sh`
- `scripts/deploy_devnet_contract.sh`

## Edge Cases and Failure Handling

- `Cannot find the leaf for nullifier` during deploy:
likely class publication was skipped for a contract requiring it; rerun without `--no-class-registration`.
- Public function call fails after deployment:
instance is likely not publicly deployed; avoid `--no-public-deployment` for public workflows.
- Deployment reports success but contract is not callable:
check initialization and publication states separately.
- `No transactions are needed to publish or initialize contract ...`:
expected for some private-only/no-initializer combinations under selected options.
- Devnet `Timeout awaiting isMined`:
treat as pending and query tx status by hash.
- Constructor argument mismatch:
check selected initializer (`--init`) and ABI ordering/types.

## Next Steps / Related Files

- Use `reference.md` for deployment-state matrix, command options, and troubleshooting runbooks.
- Use `patterns.md` for copy/paste local/devnet CLI and Aztec.js deployment patterns.
- Use `scripts/` for repeatable preflight and deployment wrappers.

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
