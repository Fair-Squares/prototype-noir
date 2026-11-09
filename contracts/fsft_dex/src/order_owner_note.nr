use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// Private ownership receipt for a V3 lit-book order.
///
/// The ONLY artifact that ties a person to an order. The public order book
/// stores no owner address -- only `owner_tag = poseidon2([secret_owner_key, seq])`.
/// To cancel an order or claim its proceeds, the owner proves they hold this
/// note (kernel-verified), recomputes the tag, and the public tail checks it
/// against `o_owner_tag[seq]` -- authorizing the action WITHOUT revealing who.
///
/// `secret_owner_key` is fresh random per order (supplied by the wallet), so
/// `owner_tag` is unlinkable across a single owner's orders. `side` /
/// `escrow_token` are not stored here -- they live on the public book, read by seq.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct OrderOwnerNote {
    pub owner: AztecAddress,
    pub secret_owner_key: Field,
    pub seq: u64,
}

impl OrderOwnerNote {
    pub fn new(owner: AztecAddress, secret_owner_key: Field, seq: u64) -> Self {
        Self { owner, secret_owner_key, seq }
    }
}
