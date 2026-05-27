use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A private record of a reward allocation owed to `owner` for a given epoch.
///
/// Stored in the recipient's PXE-side set. The full V2 claim flow
/// (consume note + privately mint protocol token to owner) is staged for a
/// follow-up; this type + storage exist so allocations can already be
/// recorded privately.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct RewardClaimNote {
    pub owner: AztecAddress,
    pub amount: u128,
    pub epoch: u32,
}

impl RewardClaimNote {
    pub fn new(owner: AztecAddress, amount: u128, epoch: u32) -> Self {
        Self { owner, amount, epoch }
    }
}
