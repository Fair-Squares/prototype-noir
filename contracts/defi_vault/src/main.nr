mod test;

use aztec::macros::aztec;

/// DeFiVault -- the pluggable yield-source adapter seam for Fair Squares.
///
/// Holds idle fund principal at par and tracks any REAL yield reported by a
/// configured external yield source (a tokenized-T-bill / money-market adapter
/// wired in via `set_yield_source`). There is NO simulated yield: with no source
/// configured the vault reports principal only (zero yield), and `accrue_yield`
/// can be called ONLY by the configured source -- the fund can never fabricate
/// yield. Swap in a real adapter to make the yield real (Phase 1.1; see
/// docs/PHASE1_YIELD_AND_RENT.md). All state is PUBLIC (fund transparency).
///
/// `yield_rate_bps` is advertised/expected-rate metadata only; it is never used
/// to compute or accrue any yield.
#[aztec]
pub contract DeFiVault {
    use aztec::{
        macros::{
            functions::{external, initializer},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        // The external yield source (a real DeFi adapter). Zero = none, so the
        // vault holds principal at par and no yield can ever be reported.
        yield_source: PublicMutable<AztecAddress, Context>,
        // Advertised / expected annual rate (bps), metadata only -- never used
        // to accrue yield.
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
        // yield_source intentionally left unset (zero) -- no real adapter yet.
    }

    // Set the housing fund address (called after all contracts deployed)
    #[external("public")]
    fn set_housing_fund(housing_fund: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        self.storage.housing_fund.write(housing_fund);
    }

    // Admin: wire the external yield source (a real DeFi adapter -- e.g. a
    // tokenized-T-bill / money-market position). Until set, the vault holds
    // principal at par with zero yield. Only this source can report realized
    // yield via accrue_yield.
    #[external("public")]
    fn set_yield_source(yield_source: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.yield_source.write(yield_source);
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

    // Realized yield reported by the configured external yield source. NOT
    // admin-callable: the fund cannot invent yield. Reverts when no source is
    // configured, so the protocol runs with zero (honest) yield until a real
    // adapter is plugged in.
    #[external("public")]
    fn accrue_yield(yield_amount: u64) {
        let source = self.storage.yield_source.read();
        assert(!source.is_zero(), "no yield source configured");
        assert_eq(self.msg_sender(), source, "only the yield source can report yield");
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

    #[external("utility")]
    unconstrained fn get_balance() -> pub u64 {
        self.storage.total_deposited.read() + self.storage.accrued_yield.read()
    }

    #[external("utility")]
    unconstrained fn get_total_deposited() -> pub u64 {
        self.storage.total_deposited.read()
    }

    #[external("utility")]
    unconstrained fn get_accrued_yield() -> pub u64 {
        self.storage.accrued_yield.read()
    }

    #[external("utility")]
    unconstrained fn get_yield_rate_bps() -> pub u32 {
        self.storage.yield_rate_bps.read()
    }

    // The configured external yield source (zero when none is wired -- the
    // honest default, meaning the vault holds principal at par with no yield).
    #[external("utility")]
    unconstrained fn get_yield_source() -> pub AztecAddress {
        self.storage.yield_source.read()
    }
}
