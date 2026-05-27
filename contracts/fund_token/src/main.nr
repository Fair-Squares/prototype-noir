use aztec::macros::aztec;

/// FundToken (FSFT) -- Fair Squares Fund Token.
///
/// Based on the BobToken pattern from the official Aztec v4 token tutorial.
///
/// Privacy:
///   PUBLIC:  total_supply, admin -- visible to everyone
///   PRIVATE: individual balances (per-user notes in their PXE via BalanceSet)
///
/// Investors cannot see each other's balances -- only their own.
#[aztec]
pub contract FundToken {
    use aztec::{
        macros::{
            functions::{authorize_once, external, initializer, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::ToField,
        },
        state_vars::{Map, Owned, PublicMutable},
    };
    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        total_supply: PublicMutable<u64, Context>,
        // Per-user private balances (encrypted notes, only owner can decrypt)
        private_balances: Owned<BalanceSet<Context>, Context>,
        // Public balances (for transparency when needed)
        public_balances: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        // owner+spender key -> delegated private spend approval
        delegated_private_spenders: Map<Field, PublicMutable<bool, Context>, Context>,
        // privacy-preserving holder attestation flag (no balance disclosure)
        private_holder_proof: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.total_supply.write(0);
    }

    // -- Public Minting --------------------------------------------------

    #[external("public")]
    fn mint_public(to: AztecAddress, amount: u64) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "only admin can mint");
        assert(amount > 0, "amount must be positive");

        let balance = self.storage.public_balances.at(to).read();
        self.storage.public_balances.at(to).write(balance + amount);

        let supply = self.storage.total_supply.read();
        self.storage.total_supply.write(supply + amount);
    }

    // -- Private Minting (admin-only, verified via enqueued public check) -

    #[external("private")]
    fn mint_private(to: AztecAddress, amount: u64) {
        // Enqueue ownership check -- reverts entire tx if not admin
        self.enqueue_self._assert_is_admin(self.msg_sender());

        // Mint privately (creates encrypted notes for recipient)
        self.storage.private_balances.at(to).add(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Track supply publicly
        self.enqueue_self._increase_supply(amount);
    }

    // -- Public -> Private (shield tokens) ---------------------------------

    #[external("private")]
    fn public_to_private(amount: u64) {
        let sender = self.msg_sender();

        // Deduct from public balance
        self.enqueue_self._deduct_public_balance(sender, amount);

        // Add to private balance
        self.storage.private_balances.at(sender).add(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    // -- Private -> Public (unshield tokens) -------------------------------

    #[external("private")]
    fn private_to_public(amount: u64) {
        let sender = self.msg_sender();

        // Consume private notes
        self.storage.private_balances.at(sender).sub(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Credit public balance
        self.enqueue_self._credit_public_balance(sender, amount);
    }

    // -- Public Transfer --------------------------------------------------

    #[external("public")]
    fn transfer_public(to: AztecAddress, amount: u64) {
        let sender = self.msg_sender();
        let sender_balance = self.storage.public_balances.at(sender).read();
        assert(sender_balance >= amount, "insufficient public balance");

        self.storage.public_balances.at(sender).write(sender_balance - amount);
        let recipient_balance = self.storage.public_balances.at(to).read();
        self.storage.public_balances.at(to).write(recipient_balance + amount);
    }

    // -- Private Transfer (fully private, no one sees who/how much) -------

    #[external("private")]
    fn transfer_private(to: AztecAddress, amount: u64) {
        let sender = self.msg_sender();

        // Consume sender's notes
        self.storage.private_balances.at(sender).sub(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Create notes for recipient
        self.storage.private_balances.at(to).add(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    // -- Private delegated spend primitives --------------------------------

    #[external("public")]
    fn set_private_spender(spender: AztecAddress, allowed: bool) {
        assert(!spender.is_zero(), "invalid spender");
        let owner = self.msg_sender();
        let key = poseidon2_hash([owner.to_field(), spender.to_field()]);
        self.storage.delegated_private_spenders.at(key).write(allowed);
    }

    #[external("private")]
    fn transfer_private_from(owner: AztecAddress, to: AztecAddress, amount: u64) {
        let spender = self.msg_sender();
        assert(amount > 0, "amount must be positive");

        if !spender.eq(owner) {
            self.enqueue_self._assert_private_spender_approved(owner, spender);
        }

        self.storage.private_balances.at(owner).sub(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.storage.private_balances.at(to).add(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    // V2 authwit-based transfer. The #[authorize_once] macro injects a
    // check that `from` has authorized this exact call (matching args +
    // nonce); if from == msg_sender the nonce must be 0. This is the
    // canonical Aztec.nr token pattern from v4.3.0 noir-contracts.
    // FSFTDex.match_order_private uses this to settle EUR + FSFT
    // atomically using maker/taker-issued private authwits.
    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn transfer_in_private(
        from: AztecAddress,
        to: AztecAddress,
        amount: u64,
        authwit_nonce: Field,
    ) {
        let _ = authwit_nonce;
        assert(amount > 0, "amount must be positive");
        self.storage.private_balances.at(from).sub(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.storage.private_balances.at(to).add(amount as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    // -- Private-holder proof path -----------------------------------------

    #[external("private")]
    fn attest_private_holder() {
        let caller = self.msg_sender();
        // Prove private ownership by doing a reversible 1-unit note roundtrip.
        // If balance is zero, sub(1) reverts ("Balance too low").
        self.storage.private_balances.at(caller).sub(1).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.storage.private_balances.at(caller).add(1).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.enqueue_self._set_private_holder_proof(caller, true);
    }

    #[external("public")]
    fn clear_private_holder_proof() {
        let caller = self.msg_sender();
        self.storage.private_holder_proof.at(caller).write(false);
    }

    // -- Public Burn ------------------------------------------------------

    #[external("public")]
    fn burn_public(from: AztecAddress, amount: u64) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "only admin can burn");
        assert(amount > 0, "amount must be positive");

        let balance = self.storage.public_balances.at(from).read();
        assert(balance >= amount, "insufficient balance to burn");
        self.storage.public_balances.at(from).write(balance - amount);

        let supply = self.storage.total_supply.read();
        self.storage.total_supply.write(supply - amount);
    }

    // -- Admin Transfer ---------------------------------------------------

    #[external("public")]
    fn set_admin(new_admin: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "only admin can transfer ownership");
        assert(!new_admin.is_zero(), "invalid new admin");
        self.storage.admin.write(new_admin);
    }

    // -- Internal helpers (called via enqueue from private functions) ------

    #[external("public")]
    #[only_self]
    fn _assert_is_admin(address: AztecAddress) {
        assert_eq(address, self.storage.admin.read(), "only admin can mint");
    }

    #[external("public")]
    #[only_self]
    fn _increase_supply(amount: u64) {
        let supply = self.storage.total_supply.read();
        self.storage.total_supply.write(supply + amount);
    }

    #[external("public")]
    #[only_self]
    fn _deduct_public_balance(owner: AztecAddress, amount: u64) {
        let balance = self.storage.public_balances.at(owner).read();
        assert(balance >= amount, "insufficient public balance");
        self.storage.public_balances.at(owner).write(balance - amount);
    }

    #[external("public")]
    #[only_self]
    fn _credit_public_balance(owner: AztecAddress, amount: u64) {
        let balance = self.storage.public_balances.at(owner).read();
        self.storage.public_balances.at(owner).write(balance + amount);
    }

    #[external("public")]
    #[only_self]
    fn _assert_private_spender_approved(owner: AztecAddress, spender: AztecAddress) {
        let key = poseidon2_hash([owner.to_field(), spender.to_field()]);
        assert(self.storage.delegated_private_spenders.at(key).read(), "spender not approved");
    }

    #[external("public")]
    #[only_self]
    fn _set_private_holder_proof(owner: AztecAddress, value: bool) {
        self.storage.private_holder_proof.at(owner).write(value);
    }

    // -- View Functions ---------------------------------------------------

    #[external("utility")]
    unconstrained fn total_supply() -> pub u64 {
        self.storage.total_supply.read()
    }

    #[external("public")]
    #[view]
    fn total_supply_public() -> pub u64 {
        self.storage.total_supply.read()
    }

    #[external("utility")]
    unconstrained fn public_balance_of(owner: AztecAddress) -> pub u64 {
        self.storage.public_balances.at(owner).read()
    }

    #[external("public")]
    #[view]
    fn public_balance_of_public(owner: AztecAddress) -> pub u64 {
        self.storage.public_balances.at(owner).read()
    }

    #[external("utility")]
    unconstrained fn get_admin() -> pub AztecAddress {
        self.storage.admin.read()
    }

    #[external("utility")]
    unconstrained fn private_balance_of(owner: AztecAddress) -> pub u128 {
        self.storage.private_balances.at(owner).balance_of()
    }

    #[external("utility")]
    unconstrained fn is_private_spender_approved(owner: AztecAddress, spender: AztecAddress) -> pub bool {
        let key = poseidon2_hash([owner.to_field(), spender.to_field()]);
        self.storage.delegated_private_spenders.at(key).read()
    }

    #[external("public")]
    #[view]
    fn has_private_holder_proof(owner: AztecAddress) -> pub bool {
        self.storage.private_holder_proof.at(owner).read()
    }
}
