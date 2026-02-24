use ::aztec::macros::aztec;

// DeFiVault - yield generation stub for Fair Squares.
// Simplified block-based yield model. All state is PUBLIC.
#[aztec]
pub contract DeFiVault {
    use ::aztec::{
        macros::{
            functions::{external, initializer, view, only_self},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        housing_fund: PublicMutable<AztecAddress, Context>,
        yield_rate_bps: PublicMutable<u32, Context>,
        total_deposited: PublicMutable<u128, Context>,
        accrued_yield: PublicMutable<u128, Context>,
        last_accrual_block: PublicMutable<u32, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(housing_fund: AztecAddress, yield_rate_bps: u32) {
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        self.storage.housing_fund.write(housing_fund);
        self.storage.yield_rate_bps.write(yield_rate_bps);
        self.storage.total_deposited.write(0);
        self.storage.accrued_yield.write(0);
        self.storage.last_accrual_block.write(0);
    }

    #[external("public")]
    fn deposit(amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.housing_fund.read().eq(caller),
            "only housing fund can deposit"
        );
        assert(amount > 0, "amount must be positive");

        // Inline yield accrual
        let principal = self.storage.total_deposited.read();
        let last_block = self.storage.last_accrual_block.read();
        let current_block = self.context.block_number();
        if (principal > 0) & (current_block > last_block) {
            let blocks_elapsed = (current_block - last_block) as u128;
            let rate_bps = self.storage.yield_rate_bps.read() as u128;
            let yield_amount = (principal * rate_bps * blocks_elapsed) / 26_280_000_000;
            if yield_amount > 0 {
                let cy = self.storage.accrued_yield.read();
                self.storage.accrued_yield.write(cy + yield_amount);
            }
        }
        self.storage.last_accrual_block.write(current_block);

        self.storage.total_deposited.write(principal + amount);
    }

    #[external("public")]
    fn withdraw(amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.housing_fund.read().eq(caller),
            "only housing fund can withdraw"
        );

        // Inline yield accrual
        let deposited = self.storage.total_deposited.read();
        let last_block = self.storage.last_accrual_block.read();
        let current_block = self.context.block_number();
        if (deposited > 0) & (current_block > last_block) {
            let blocks_elapsed = (current_block - last_block) as u128;
            let rate_bps = self.storage.yield_rate_bps.read() as u128;
            let yield_amount = (deposited * rate_bps * blocks_elapsed) / 26_280_000_000;
            if yield_amount > 0 {
                let cy = self.storage.accrued_yield.read();
                self.storage.accrued_yield.write(cy + yield_amount);
            }
        }
        self.storage.last_accrual_block.write(current_block);

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

    #[external("public")]
    fn accrue_yield() {
        let principal = self.storage.total_deposited.read();
        let last_block = self.storage.last_accrual_block.read();
        let current_block = self.context.block_number();
        if (principal > 0) & (current_block > last_block) {
            let blocks_elapsed = (current_block - last_block) as u128;
            let rate_bps = self.storage.yield_rate_bps.read() as u128;
            let yield_amount = (principal * rate_bps * blocks_elapsed) / 26_280_000_000;
            if yield_amount > 0 {
                let cy = self.storage.accrued_yield.read();
                self.storage.accrued_yield.write(cy + yield_amount);
            }
        }
        self.storage.last_accrual_block.write(current_block);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn get_balance() -> pub u128 {
        self.storage.total_deposited.read() + self.storage.accrued_yield.read()
    }

    #[external("public")]
    #[view]
    fn get_total_deposited() -> pub u128 {
        self.storage.total_deposited.read()
    }

    #[external("public")]
    #[view]
    fn get_accrued_yield() -> pub u128 {
        self.storage.accrued_yield.read()
    }

    #[external("public")]
    #[view]
    fn get_yield_rate_bps() -> pub u32 {
        self.storage.yield_rate_bps.read()
    }
}
