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
///
/// Phase 3 adds three immutable FIFO/allocation fields stamped at deposit
/// time so the enhanced `claim_distribution` allocation is an
/// order-independent pure function of the note alone:
///   - `cum_before`: the gross cumulative deposit total (across all
///     depositors, public + private) BEFORE this deposit, giving the
///     deposit the immutable FIFO interval `[cum_before, cum_before+amount)`.
///   - `seq`: the global monotonic deposit index at deposit time (audit
///     ordinal; also keys the public per-deposit record without revealing
///     the owner).
///   - `is_small`: `amount <= small_threshold` at deposit time, FROZEN, so a
///     later threshold change never retroactively re-buckets a deposit. This
///     is the single classification authority for both claim paths.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct DepositNote {
    pub owner: AztecAddress,
    pub amount: u128,
    pub cum_before: u128,
    pub seq: u64,
    pub is_small: bool,
}

impl DepositNote {
    pub fn new(
        owner: AztecAddress,
        amount: u128,
        cum_before: u128,
        seq: u64,
        is_small: bool,
    ) -> Self {
        Self { owner, amount, cum_before, seq, is_small }
    }
}
