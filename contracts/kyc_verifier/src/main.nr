use ::aztec::macros::aztec;

/// KYCVerifier - on-chain registry of KYC-verified addresses.
///
/// Privacy design:
///   - Whether an address is KYC-verified is PUBLIC (required for HousingFund gate-checks)
///   - Identity documents / personal data never touch the chain
///   - A trusted backend verifier (run after zkPassport SDK verification) calls register_kyc
///   - The address itself is pseudonymous - users can create fresh addresses
#[aztec]
pub contract KYCVerifier {
    use ::aztec::{
        macros::{
            functions::{external, initializer, view},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        verifiers: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        verified: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        verified_count: PublicMutable<u32, Context>,
    }

    // CONSTRUCTOR

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.verified_count.write(0);
        self.storage.verifiers.at(admin).write(true);
    }

    // ADMIN FUNCTIONS

    #[external("public")]
    fn add_verifier(verifier: AztecAddress) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(self.storage.admin.read().eq(caller), "caller is not admin");
        assert(!verifier.is_zero(), "invalid verifier");
        self.storage.verifiers.at(verifier).write(true);
    }

    #[external("public")]
    fn remove_verifier(verifier: AztecAddress) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(self.storage.admin.read().eq(caller), "caller is not admin");
        self.storage.verifiers.at(verifier).write(false);
    }

    #[external("public")]
    fn revoke_kyc(user: AztecAddress) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(self.storage.admin.read().eq(caller), "caller is not admin");
        if self.storage.verified.at(user).read() {
            self.storage.verified.at(user).write(false);
            let count = self.storage.verified_count.read();
            if count > 0 {
                self.storage.verified_count.write(count - 1);
            }
        }
    }

    // VERIFIER FUNCTIONS

    #[external("public")]
    fn register_kyc(user: AztecAddress) {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.verifiers.at(caller).read(),
            "caller is not an authorised verifier"
        );
        assert(!user.is_zero(), "invalid user address");

        if !self.storage.verified.at(user).read() {
            self.storage.verified.at(user).write(true);
            let count = self.storage.verified_count.read();
            self.storage.verified_count.write(count + 1);
        }
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn is_verified(user: AztecAddress) -> bool {
        self.storage.verified.at(user).read()
    }

    #[external("public")]
    #[view]
    fn get_verified_count() -> u32 {
        self.storage.verified_count.read()
    }

    #[external("public")]
    #[view]
    fn get_admin() -> AztecAddress {
        self.storage.admin.read()
    }
}
