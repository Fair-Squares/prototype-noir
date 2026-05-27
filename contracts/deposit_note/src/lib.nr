use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A private record of EUR deposited into the housing fund by `owner`.
///
/// Lives in the recipient's PXE-side note set. The housing-fund contract
/// emits these notes from its private `deposit_private` entrypoint and
/// only increments the public `total_deposits` aggregate via an
/// `only_self` enqueued public call, so the deposit transaction does not
/// link the user's address to the amount in public state.
///
/// Defined as a top-level library crate (rather than nested under
/// housing_fund) so that downstream contracts (e.g., Governance) can
/// accept `HintedNote<DepositNote>` arguments for fund-exposure proofs
/// without a circular Nargo dependency on housing_fund.
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
