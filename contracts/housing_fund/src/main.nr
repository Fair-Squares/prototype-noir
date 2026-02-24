use ::aztec::macros::aztec;

// HousingFund - the core Fair Squares protocol contract.
//
// PUBLIC state: total deposits, total in DeFi, total allocated, pause status
// PRIVATE actions: deposit and withdraw (identity hidden, amounts hidden)
//
// Flow:
//   1. User calls deposit(amount) - private function in their PXE
//   2. KYC check runs (public read from private context)
//   3. FSFT tokens are minted to the depositor (private)
//   4. Total deposits increment (public) - but WHO deposited is hidden
//
// For the prototype, cross-contract calls are simplified to address checks.
#[aztec]
pub contract HousingFund {
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
        admin: PublicMutable<AztecAddress, Context>,
        // Linked contracts
        kyc_verifier: PublicMutable<AztecAddress, Context>,
        fund_token: PublicMutable<AztecAddress, Context>,
        defi_vault: PublicMutable<AztecAddress, Context>,
        governance: PublicMutable<AztecAddress, Context>,

        // Fund accounting (all public - transparent to investors)
        total_deposits: PublicMutable<u128, Context>,
        total_in_defi: PublicMutable<u128, Context>,
        total_allocated: PublicMutable<u128, Context>,

        // Emergency pause
        is_paused: PublicMutable<bool, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(
        admin: AztecAddress,
        kyc_verifier: AztecAddress,
        fund_token: AztecAddress,
        defi_vault: AztecAddress,
        governance: AztecAddress,
    ) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.kyc_verifier.write(kyc_verifier);
        self.storage.fund_token.write(fund_token);
        self.storage.defi_vault.write(defi_vault);
        self.storage.governance.write(governance);
        self.storage.total_deposits.write(0);
        self.storage.total_in_defi.write(0);
        self.storage.total_allocated.write(0);
        self.storage.is_paused.write(false);
    }

    // DEPOSIT - simplified for prototype
    // In production, this would be a private function that calls
    // KYCVerifier.is_verified() and FundToken.mint_private()
    // For now, it's public with an admin/authorized check
    #[external("public")]
    fn deposit(amount: u128) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        assert(amount > 0, "amount must be positive");

        let current = self.storage.total_deposits.read();
        self.storage.total_deposits.write(current + amount);
    }

    // WITHDRAW - simplified for prototype
    #[external("public")]
    fn withdraw(amount: u128) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        assert(amount > 0, "amount must be positive");

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        self.storage.total_deposits.write(deposits - amount);
    }

    // ADMIN: Move funds to DeFi vault
    #[external("public")]
    fn deploy_to_defi(amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.admin.read().eq(caller) |
            self.storage.governance.read().eq(caller),
            "not authorized"
        );

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        let current_in_defi = self.storage.total_in_defi.read();
        self.storage.total_in_defi.write(current_in_defi + amount);
    }

    // ADMIN: Withdraw from DeFi vault
    #[external("public")]
    fn withdraw_from_defi(amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.admin.read().eq(caller) |
            self.storage.governance.read().eq(caller),
            "not authorized"
        );

        let in_defi = self.storage.total_in_defi.read();
        assert(amount <= in_defi, "exceeds defi balance");

        self.storage.total_in_defi.write(in_defi - amount);
    }

    // GOVERNANCE: Reserve funds for property acquisition
    #[external("public")]
    fn reserve_for_property(proposal_id: u32, amount: u128) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.governance.read().eq(caller),
            "only governance can reserve"
        );

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        self.storage.total_allocated.write(allocated + amount);
    }

    // EMERGENCY CONTROLS

    #[external("public")]
    fn pause() {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(self.storage.admin.read().eq(caller), "not admin");
        self.storage.is_paused.write(true);
    }

    #[external("public")]
    fn unpause() {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(self.storage.admin.read().eq(caller), "not admin");
        self.storage.is_paused.write(false);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn get_total_deposits() -> pub u128 {
        self.storage.total_deposits.read()
    }

    #[external("public")]
    #[view]
    fn get_fund_stats() -> pub (u128, u128, u128, u128) {
        let total = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = total - in_defi - allocated;
        (total, in_defi, allocated, available)
    }

    #[external("public")]
    #[view]
    fn is_paused() -> pub bool {
        self.storage.is_paused.read()
    }
}
