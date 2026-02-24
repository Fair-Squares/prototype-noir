# Reference Documentation

Links to essential documentation for developing Fair Squares.

## Aztec Network

- **LLMs.txt (full docs index):** https://docs.aztec.network/llms.txt
- **Getting Started (local network):** https://docs.aztec.network/developers/getting_started_on_local_network
- **Counter Contract Tutorial:** https://docs.aztec.network/developers/docs/tutorials/contract_tutorials/counter_contract
- **Token Contract Tutorial:** https://docs.aztec.network/developers/docs/tutorials/contract_tutorials/token_contract
- **Foundational Topics:** https://docs.aztec.network/developers/docs/foundational-topics
- **Aztec.nr Framework:** https://github.com/AztecProtocol/aztec-nr (tag: v4.0.0-devnet.2-patch.0)
- **Aztec Monorepo:** https://github.com/AztecProtocol/aztec-packages

### Aztec v4 Key Patterns

```toml
# Nargo.toml dependencies (use aztec-nr repo, NOT aztec-packages)
[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-nr/", tag = "v4.0.0-devnet.2-patch.0", directory = "aztec" }
balance_set = { git = "https://github.com/AztecProtocol/aztec-nr/", tag = "v4.0.0-devnet.2-patch.0", directory = "balance-set" }
```

```rust
// Imports (no leading ::)
use aztec::macros::aztec;
use aztec::{
    macros::{functions::{external, initializer, only_self}, storage::storage},
    messages::message_delivery::MessageDelivery,
    protocol::address::AztecAddress,
    state_vars::{Map, Owned, PublicMutable},
};
use balance_set::BalanceSet;

// msg_sender
self.msg_sender()  // NOT self.context.maybe_msg_sender().unwrap()

// Private → public enqueue
self.enqueue_self._public_method(args)  // NOT self.enqueue(Contract::at(...))

// Private balances
Owned<BalanceSet<Context>, Context>  // NOT Map<..., Owned<BalanceSet>>
.at(owner).add(amount as u128).deliver(MessageDelivery.ONCHAIN_CONSTRAINED)

// Unconstrained views
#[external("utility")]
unconstrained fn view_fn() -> pub Type { ... }
```

### Docker / CLI

```bash
# Install Aztec toolchain
VERSION=4.0.0-devnet.2-patch.0 bash -i <(curl -sL https://install.aztec.network/4.0.0-devnet.2-patch.0)

# Start local network
aztec start --local-network

# Compile contract
cd contracts/my_contract && aztec compile

# Generate TypeScript
aztec codegen target --outdir artifacts

# Deploy via wallet CLI
aztec-wallet import-test-accounts
aztec-wallet deploy ArtifactName --from accounts:test0 --args ... -a alias
```

## zkPassport

- **Quick Start:** https://docs.zkpassport.id/getting-started/quick-start
- **Basic Usage:** https://docs.zkpassport.id/getting-started/basic-usage
- **Dev Mode (mock passports):** https://docs.zkpassport.id/getting-started/dev-mode
- **Onchain Verification:** https://docs.zkpassport.id/getting-started/onchain
- **KYC Example:** https://docs.zkpassport.id/examples/kyc
- **SDK:** `npm install @zkpassport/sdk` (no API key needed)
- **GitHub:** https://github.com/zkpassport/zkpassport-sdk

### zkPassport Dev Mode

For local development without a real passport:

```typescript
import { ZKPassport } from "@zkpassport/sdk";

const zkPassport = new ZKPassport("your-domain.com");
const request = await zkPassport.request({
  name: "Fair Squares",
  logo: "https://fair-squares.local/logo.png",
  purpose: "KYC Verification",
  scope: "fair-squares-kyc",
  devMode: true,  // Enable mock passports
});
```

Enable dev mode in the mobile app: long-press at the bottom of the first screen → 6 mock passports loaded.

### zkPassport Onchain Verification (EVM)

Verifier contract: `0x1D000001000EFD9a6371f4d90bB8920D5431c0D8` (same address on all supported chains).

Supported chains: Ethereum Mainnet, Ethereum Sepolia, Base Mainnet.

### zkPassport KYC Flow

```typescript
const { url, onResult } = queryBuilder
  .disclose("nationality")
  .disclose("birthdate")
  .disclose("fullname")
  .disclose("expiry_date")
  .disclose("document_number")
  .sanctions()
  .facematch("strict")
  .done();

onResult(({ verified, result }) => {
  if (verified) {
    // Use result.nationality.disclose.result, etc.
    // Call our KYCVerifier contract to register the user
  }
});
```

## Version Matrix

| Component | Version |
|-----------|---------|
| Aztec Docker | `aztecprotocol/aztec:4.0.0-devnet.2-patch.0` |
| Aztec CLI | `4.0.0-devnet.2-patch.0` |
| aztec-nr (Nargo) | `v4.0.0-devnet.2-patch.0` |
| @aztec/aztec.js | `4.0.0-devnet.2-patch.0` |
| @aztec/accounts | `4.0.0-devnet.2-patch.0` |
| @aztec/wallets | `4.0.0-devnet.2-patch.0` |
| zkPassport SDK | Latest (`@zkpassport/sdk`) |
| Noir compiler | Bundled with Aztec CLI |
