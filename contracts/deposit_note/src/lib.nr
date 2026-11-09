use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        hash::poseidon2_hash,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// H1: domain tag for the per-note withdraw marker nullifier that
/// HousingFund.withdraw_private pushes when a DepositNote is spent.
pub global WITHDRAW_NULLIFIER_DOMAIN: Field = 0x1505_5749_5448_4452_4157; // "WITHDRAW" tag

/// H1: the per-note withdraw marker (inner nullifier). HousingFund pushes it on
/// withdraw_private; its claim/reinvest paths -- and Governance's fund-exposure
/// vote check -- recompute it from the same kernel-verified note and prove its
/// SILOED form (siloed to the note's origin contract) was absent at their
/// anchor/snapshot block. Lives here, next to DepositNote, so every consumer
/// derives the marker from one definition.
pub fn withdraw_marker_nullifier(note_hash: Field) -> Field {
    poseidon2_hash([note_hash, WITHDRAW_NULLIFIER_DOMAIN])
}

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
