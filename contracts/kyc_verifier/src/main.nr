pub mod credential_note;

mod test;

use aztec::macros::aztec;

/// KYCVerifier - registry of KYC-verified addresses.
///
/// V2 (additive): credentials are issued as private notes (`KycCredentialNote`) to
/// the user's wallet, and downstream contracts prove eligibility by attesting a
/// hinted note. The legacy public `verified` / `investor_role` maps are kept for
/// backward compatibility with V1 callers (HousingFund, Governance, FSFTDex,
/// ProtocolRewards) until they migrate in their own stages.
///
/// Privacy posture going forward:
///   - Identity documents / personal data never touch the chain
///   - Verified status leaves no public per-address row in V2 callers
///   - Only the aggregate `verified_count` is public
#[aztec]
pub contract KYCVerifier {
    use crate::credential_note::KycCredentialNote;
    use aztec::{
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{constants::MAX_NOTES_PER_PAGE, HintedNote, note_getter_options::NoteStatus},
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::ToField,
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable, StateVariable},
        utils::array,
    };

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        verifiers: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        // Legacy public verified flags (kept while downstream contracts depend on them).
        verified: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        investor_role: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        verified_count: PublicMutable<u32, Context>,
        // V2 private credentials: one note set per recipient address.
        kyc_credentials: Owned<PrivateSet<KycCredentialNote, Context>, Context>,
        // V2 revocations: poseidon2_hash([owner.to_field(), nonce]) -> revoked?
        revocations: Map<Field, PublicMutable<bool, Context>, Context>,
    }

    // CONSTRUCTOR

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.verified_count.write(0);
        self.storage.verifiers.at(admin).write(true);
    }

    // ADMIN FUNCTIONS

    #[external("public")]
    fn add_verifier(verifier: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "caller is not admin");
        assert(!verifier.is_zero(), "invalid verifier");
        self.storage.verifiers.at(verifier).write(true);
    }

    #[external("public")]
    fn remove_verifier(verifier: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "caller is not admin");
        self.storage.verifiers.at(verifier).write(false);
    }

    #[external("public")]
    fn revoke_kyc(user: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "caller is not admin");
        if self.storage.verified.at(user).read() {
            self.storage.verified.at(user).write(false);
            self.storage.investor_role.at(user).write(false);
            let count = self.storage.verified_count.read();
            if count > 0 {
                self.storage.verified_count.write(count - 1);
            }
        }
    }

    // VERIFIER FUNCTIONS

    #[external("public")]
    fn register_kyc(user: AztecAddress) {
        assert(
            self.storage.verifiers.at(self.msg_sender()).read(),
            "caller is not an authorised verifier",
        );
        assert(!user.is_zero(), "invalid user address");

        if !self.storage.verified.at(user).read() {
            self.storage.verified.at(user).write(true);
            self.storage.investor_role.at(user).write(true);
            let count = self.storage.verified_count.read();
            self.storage.verified_count.write(count + 1);
        } else {
            // Ensure investor role exists for already-verified legacy entries.
            self.storage.investor_role.at(user).write(true);
        }
    }

    // V2: PRIVATE CREDENTIAL FLOW

    /// Verifier-only: deliver a private KycCredentialNote to `recipient`.
    /// The note ends up in the recipient's PXE; downstream contracts will later
    /// prove its existence (and check `revocations`) inside their own private
    /// entrypoints. `nonce` must be unique per credential per recipient and is
    /// used together with `recipient` to compute the revocation commitment.
    #[external("private")]
    fn issue_credential(recipient: AztecAddress, nonce: Field) {
        assert(!recipient.is_zero(), "invalid recipient");

        // Verifier-permission check happens in the enqueued public tail (private
        // functions can't read public `verifiers` directly).
        self.enqueue_self._assert_is_verifier(self.msg_sender());

        let note = KycCredentialNote::new(recipient, nonce);
        self.storage.kyc_credentials.at(recipient).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        self.enqueue_self._record_credential_issue();
    }

    /// Admin-only: mark a credential commitment as revoked. Downstream contracts
    /// must read `is_credential_revoked` in their public tail and reject if true.
    #[external("public")]
    fn revoke_credential(commitment: Field) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "caller is not admin");
        self.storage.revocations.at(commitment).write(true);
    }

    /// Utility: deterministic commitment for a (owner, nonce) pair. The verifier
    /// records this off-chain at issuance so it can later revoke without
    /// touching the recipient's private note set.
    #[external("utility")]
    unconstrained fn compute_revocation_commitment(
        owner: AztecAddress,
        nonce: Field,
    ) -> pub Field {
        poseidon2_hash([owner.to_field(), nonce])
    }

    // INTERNAL (only_self)

    #[external("public")]
    #[only_self]
    fn _assert_is_verifier(caller: AztecAddress) {
        assert(
            self.storage.verifiers.at(caller).read(),
            "caller is not an authorised verifier",
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_credential_issue() {
        let count = self.storage.verified_count.read();
        self.storage.verified_count.write(count + 1);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn is_verified(user: AztecAddress) -> pub bool {
        self.storage.verified.at(user).read()
    }

    #[external("public")]
    #[view]
    fn is_credential_revoked(commitment: Field) -> pub bool {
        self.storage.revocations.at(commitment).read()
    }

    #[external("public")]
    #[view]
    fn is_investor(user: AztecAddress) -> pub bool {
        self.storage.investor_role.at(user).read()
    }

    #[external("utility")]
    unconstrained fn get_verified_count() -> pub u32 {
        self.storage.verified_count.read()
    }

    #[external("utility")]
    unconstrained fn get_admin() -> pub AztecAddress {
        self.storage.admin.read()
    }

    /// PXE-side helper: fetch the owner's KycCredentialNotes as a paged
    /// BoundedVec<HintedNote>. The caller invokes this via
    /// .simulate({ from: owner }) to retrieve hints they can then pass
    /// into V2 private entrypoints (e.g. HousingFund.deposit_private,
    /// Governance.cast_vote_private). Pattern mirrors
    /// crowdfunding_contract.get_donation_notes from aztec-packages.
    #[external("utility")]
    unconstrained fn get_my_kyc_credentials(
        owner: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<HintedNote<KycCredentialNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = self.storage.kyc_credentials.get_storage_slot();
        let opt_notes = aztec::oracle::notes::get_notes(
            Option::some(owner),
            storage_slot,
            0,
            [], [], [], [], [], [], [], [],
            [],
            MAX_NOTES_PER_PAGE,
            page_index * MAX_NOTES_PER_PAGE,
            NoteStatus.ACTIVE,
        );
        array::collapse(opt_notes)
    }
}
