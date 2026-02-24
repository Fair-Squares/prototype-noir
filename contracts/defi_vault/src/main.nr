use aztec::macros::aztec;

/// DeFiVault — yield generation stub for Fair Squares.
///
/// Simplified model: tracks deposits and manually-accrued yield.
/// In production, this would integrate with real DeFi protocols.
/// All state is PUBLIC (fund transparency).
#[aztec]
pub contract DeFiVault {
    use aztec::{
        macros::{
            functions::{external, initializer, view},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        yield_rate_bps: PublicMutable<u32, Context>,
        total_deposited: PublicMutable<u64, Context>,
        accrued_yield: PublicMutable<u64, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress, yield_rate_bps: u32) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.yield_rate_bps.write(yield_rate_bps);
        self.storage.total_deposited.write(0);
        self.storage.accrued_yield.write(0);
    }

    // Set the housing fund address (called after all contracts deployed)
    #[external("public")]
    fn set_housing_fund(housing_fund: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        self.storage.housing_fund.write(housing_fund);
    }

    // Deposit funds (called by HousingFund or admin)
    #[external("public")]
    fn deposit(amount: u64) {
        let caller = self.msg_sender();
        let hf = self.storage.housing_fund.read();
        let admin = self.storage.admin.read();
        assert(
            hf.eq(caller) | admin.eq(caller),
            "only housing fund or admin can deposit",
        );
        assert(amount > 0, "amount must be positive");

        let current = self.storage.total_deposited.read();
        self.storage.total_deposited.write(current + amount);
    }

    // Withdraw funds (called by HousingFund or admin)
    #[external("public")]
    fn withdraw(amount: u64) {
        let caller = self.msg_sender();
        let hf = self.storage.housing_fund.read();
        let admin = self.storage.admin.read();
        assert(
            hf.eq(caller) | admin.eq(caller),
            "only housing fund or admin can withdraw",
        );

        let deposited = self.storage.total_deposited.read();
        let yield_available = self.storage.accrued_yield.read();
        let total = deposited + yield_available;
        assert(amount <= total, "insufficient balance");

        if amount <= yield_available {
            self.storage.accrued_yield.write(yield_available - amount);
        } else {
            let from_principal = amount - yield_available;
            self.storage.accrued_yield.write(0);
            self.storage.total_deposited.write(deposited - from_principal);
        }
    }

    // Manually accrue yield (simulates DeFi returns)
    // In production this would be automated or based on real protocol yield
    #[external("public")]
    fn accrue_yield(yield_amount: u64) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(yield_amount > 0, "yield must be positive");

        let current = self.storage.accrued_yield.read();
        self.storage.accrued_yield.write(current + yield_amount);
    }

    // Update yield rate
    #[external("public")]
    fn set_yield_rate(new_rate_bps: u32) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.yield_rate_bps.write(new_rate_bps);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn get_balance() -> pub u64 {
        self.storage.total_deposited.read() + self.storage.accrued_yield.read()
    }

    #[external("public")]
    #[view]
    fn get_total_deposited() -> pub u64 {
        self.storage.total_deposited.read()
    }

    #[external("public")]
    #[view]
    fn get_accrued_yield() -> pub u64 {
        self.storage.accrued_yield.read()
    }

    #[external("public")]
    #[view]
    fn get_yield_rate_bps() -> pub u32 {
        self.storage.yield_rate_bps.read()
    }
}
