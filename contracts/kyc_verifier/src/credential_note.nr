use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// Non-transferable KYC credential held privately by the verified subject.
///
/// Downstream contracts (HousingFund, Governance, FSFTDex, ProtocolRewards) prove
/// caller eligibility by passing a `HintedNote<KycCredentialNote>` to their private
/// entrypoints and calling `aztec::history::note::assert_note_existed_by(...)`.
///
/// Revocations are enforced via `KYCVerifier.revocations` keyed by
/// `poseidon2_hash([owner.to_field(), nonce])`; check via the public
/// `is_credential_revoked(commitment)` view inside the public tail of the
/// caller's flow.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct KycCredentialNote {
    pub owner: AztecAddress,
    pub nonce: Field,
}

impl KycCredentialNote {
    pub fn new(owner: AztecAddress, nonce: Field) -> Self {
        Self { owner, nonce }
    }
}
