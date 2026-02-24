use ::aztec::macros::aztec;

// FundToken (FSFT) - Fair Squares Fund Token.
//
// Privacy:
//   PUBLIC: total_supply, name, symbol, decimals - visible to everyone
//   PRIVATE: individual balances (per-user notes in their PXE)
//
// Investors cannot see each other's balances - only their own.
#[aztec]
pub contract FundToken {
    use ::aztec::{
        macros::{
            functions::{external, initializer, view, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Map, Owned, PublicImmutable, PublicMutable},
    };
    use ::balance_set::BalanceSet;
    use ::compressed_string::FieldCompressedString;

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        total_supply: PublicMutable<u128, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        decimals: PublicImmutable<u8, Context>,
        // Per-user private balances
        balances: Map<AztecAddress, Owned<BalanceSet<Context>, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress, name: FieldCompressedString, symbol: FieldCompressedString, decimals: u8) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.total_supply.write(0);
        self.storage.name.initialize(name);
        self.storage.symbol.initialize(symbol);
        self.storage.decimals.initialize(decimals);
    }

    // Called by HousingFund.deposit() - mint tokens to a recipient (private)
    #[external("private")]
    fn mint_private(to: AztecAddress, amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.admin.read().eq(caller),
            "only admin can mint"
        );
        assert(amount > 0, "amount must be positive");

        self.storage.balances.at(to).add(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED
        );

        // Update public supply
        self.enqueue(
            FundToken::at(self.context.this_address())._increase_total_supply(amount)
        );
    }

    // Called by HousingFund.withdraw() - burn tokens from a holder (private)
    #[external("private")]
    fn burn_private(from: AztecAddress, amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.admin.read().eq(caller),
            "only admin can burn"
        );
        assert(amount > 0, "amount must be positive");

        self.storage.balances.at(from).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED
        );

        // Update public supply
        self.enqueue(
            FundToken::at(self.context.this_address())._decrease_total_supply(amount)
        );
    }

    // Transfer FSFT between holders - fully private
    #[external("private")]
    fn transfer(to: AztecAddress, amount: u128) {
        let from = self.context.maybe_msg_sender().unwrap();
        assert(amount > 0, "amount must be positive");

        // Subtract from sender
        self.storage.balances.at(from).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED
        );

        // Add to recipient
        self.storage.balances.at(to).add(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED
        );
    }

    // INTERNAL: Supply tracking (called via enqueue from private functions)

    #[external("public")]
    #[only_self]
    fn _increase_total_supply(amount: u128) {
        let supply = self.storage.total_supply.read();
        self.storage.total_supply.write(supply + amount);
    }

    #[external("public")]
    #[only_self]
    fn _decrease_total_supply(amount: u128) {
        let supply = self.storage.total_supply.read();
        assert(supply >= amount, "supply underflow");
        self.storage.total_supply.write(supply - amount);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn total_supply() -> pub u128 {
        self.storage.total_supply.read()
    }

    #[external("public")]
    #[view]
    fn get_name() -> pub FieldCompressedString {
        self.storage.name.read()
    }

    #[external("public")]
    #[view]
    fn get_symbol() -> pub FieldCompressedString {
        self.storage.symbol.read()
    }

    #[external("public")]
    #[view]
    fn get_decimals() -> pub u8 {
        self.storage.decimals.read()
    }

    #[external("public")]
    #[view]
    fn get_admin() -> pub AztecAddress {
        self.storage.admin.read()
    }
}
