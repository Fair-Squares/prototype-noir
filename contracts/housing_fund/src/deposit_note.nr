use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A private record of EUR deposited into the housing fund by `owner`.
///
/// Lives in the recipient's PXE-side note set; the housing-fund contract
/// never sees per-user amounts on its public state, only the aggregate
/// `total_deposits` counter (incremented via an `only_self` enqueued
/// public call so the deposit transaction does not link the user's address
/// to the amount).
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct DepositNote {
    pub owner: AztecAddress,
    pub amount: u128,
}

impl DepositNote {
    pub fn new(owner: AztecAddress, amount: u128) -> Self {
        Self { owner, amount }
    }
}
