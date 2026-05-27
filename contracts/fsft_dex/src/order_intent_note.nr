use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A private record of a single FSFT/EUR order intent placed by `owner`.
///
/// Stored in the owner's PXE-side set. The on-chain `order_status` map keys
/// off the order commitment (poseidon2 of the note fields) so the orderbook
/// can be reasoned about publicly while the per-order owner/amount/price
/// remain in the user's wallet. Match + settlement flow is staged for a
/// follow-up.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct OrderIntentNote {
    pub owner: AztecAddress,
    pub side: u8,
    pub amount: u128,
    pub price_bps: u64,
    pub expiry_block: u32,
    pub salt: Field,
}

impl OrderIntentNote {
    pub fn new(
        owner: AztecAddress,
        side: u8,
        amount: u128,
        price_bps: u64,
        expiry_block: u32,
        salt: Field,
    ) -> Self {
        Self { owner, side, amount, price_bps, expiry_block, salt }
    }
}
