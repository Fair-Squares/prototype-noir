fn main(
    user: pub Field,
    epoch: pub Field,
    deposit_weight: pub Field,
    fsft_weight: pub Field,
    governance_weight: pub Field,
    private_nonce: Field,
) {
    // Demo rewards-weight circuit for recursive integration wiring.
    assert(user != 0);
    assert(private_nonce != 0);
    assert((deposit_weight + fsft_weight + governance_weight) != 0);
    // Epoch is a public input and can be zero for first epoch.
    assert(epoch == epoch);
}
