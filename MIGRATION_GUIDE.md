# Fair Squares Noir Contract Migration: v0.87 -> v4.0.0

## Task
Update 4 Noir smart contracts to compile with Aztec v4.0.0 / Nargo 1.0.0-beta.18.
The KYCVerifier contract has already been updated and compiles successfully — use it as reference.

## Reference: Working KYCVerifier
File: contracts/kyc_verifier/src/main.nr (already compiles)

## Contracts to Update
1. contracts/defi_vault/src/main.nr
2. contracts/governance/src/main.nr
3. contracts/housing_fund/src/main.nr
4. contracts/fund_token/src/main.nr

## Critical API Changes (MUST apply to all contracts)

### 1. Non-ASCII comments — REMOVE ALL
The Noir compiler rejects non-ASCII in comments. Replace ALL:
- Em dashes (—) with hyphens (-)
- Arrows (→) with (->)
- Multiplication signs (×) with (*)
- Box-drawing characters with plain text
- Any other non-ASCII in comments

### 2. Import paths changed
OLD: `use dep::aztec::prelude::{AztecAddress, Map, PublicMutable};`
NEW: Must use `::aztec::` prefix and explicit macro imports:
```
use ::aztec::{
    macros::{
        functions::{external, initializer, view, only_self},
        storage::storage,
    },
    protocol::address::AztecAddress,
    state_vars::{Map, PublicMutable},
};
```

### 3. Contract declaration
OLD: `contract DefiVault { ... }`
NEW: Must have `use ::aztec::macros::aztec;` BEFORE, then `#[aztec] pub contract DefiVault { ... }`

### 4. self.msg_sender()
OLD: `self.msg_sender()`
NEW: `self.context.maybe_msg_sender().unwrap()`

### 5. #[internal] annotation  
OLD: `#[internal]`
NEW: `#[only_self]` (import from macros::functions)

### 6. self.enqueue_self
OLD: `self.enqueue_self._increment_yes_votes(proposal_id);`
NEW: `self.enqueue(Governance::at(self.context.this_address())._increment_yes_votes(proposal_id));`
(Use the contract's own name)

### 7. View functions need pub return types
OLD: `fn get_balance() -> u128 {`
NEW: `fn get_balance() -> pub u128 {`

### 8. No &self or &mut self parameters
OLD: `fn _get_available_balance(&self) -> u128 {`
NEW: Just make it a regular function `fn _get_available_balance() -> pub u128 {`
Or better: inline the logic where needed, since private helper functions need proper annotations.

### 9. No early return in Noir
`return;` is NOT supported. Restructure with if/else blocks instead.

### 10. block_header::BlockHeader::get_timestamp() is GONE
OLD: `aztec::protocol::block_header::BlockHeader::get_timestamp(self.context)`
NEW: Use `self.context.block_number()` and compare with block numbers instead of timestamps.
Change deadline/timing logic from unix timestamps (u64) to block numbers (u32).

### 11. Cross-contract calls
OLD: `KYCVerifier::at(addr).is_verified(sender).call(&mut self.context);`
NEW: For public-to-public: use `KYCVerifier::at(addr).is_verified(sender).call(&mut self.context)`
     This syntax may still work, but verify. The important thing is the cross-contract type must be known.
     For a prototype, you can REMOVE cross-contract calls and replace with simple storage checks.

### 12. poseidon2_hash import
OLD: `use dep::aztec::hash::poseidon2_hash;`
NEW: `use ::aztec::hash::poseidon2_hash;` (verify this path exists)
If not available, use `use ::aztec::protocol::traits::Hash;` or `std::hash::poseidon2::Poseidon2::hash`

### 13. push_nullifier
OLD: `self.context.push_nullifier(nullifier);`
NEW: This should still work via `self.context.push_nullifier(nullifier);`

### 14. BalanceSet, UintNote (fund_token)
These are separate packages. Import as:
```
use ::balance_set::BalanceSet;
use ::uint_note::{PartialUintNote, UintNote};
use ::compressed_string::FieldCompressedString;
```
(The `dep::` prefix is replaced with `::`)

### 15. Event emission
OLD: `aztec::context::emit_encrypted_event_log::<Transfer>(...)`
NEW: Events have changed significantly. For the prototype, just REMOVE event emission.
The contract logic works without events.

### 16. Storage struct
OLD: `struct Storage { ... }`  
NEW: `#[storage] struct Storage<Context> { ... }` with proper Context generic:
```
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,
    balances: Map<AztecAddress, Owned<BalanceSet<Context>, Context>, Context>,
    total_supply: PublicMutable<u128, Context>,
}
```

## Pragmatic Simplifications for Prototype
Since this is a prototype that primarily runs in simulation mode:
1. REMOVE cross-contract calls (KYCVerifier::at, FundToken::at, HousingFund::at).
   Replace with simple assert or storage-based checks.
2. REMOVE event emissions entirely.
3. Replace timestamp-based logic with block-number-based logic.
4. For private functions that had complex note operations, simplify where possible.

## How to Test
After editing each contract, compile with:
```bash
cd contracts/<name>
nargo compile
```
The command must exit with code 0 and produce a .json artifact in target/.

## IMPORTANT
- Do NOT modify contracts/kyc_verifier — it already compiles
- Focus on getting clean compilation for all 4 remaining contracts
- Keep the business logic intact as much as possible
- ASCII only in ALL comments and strings
