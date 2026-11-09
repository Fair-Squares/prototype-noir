fn main(
    user: pub Field,
    epoch: pub Field,
    deposit_weight: pub Field,
    fsft_weight: pub Field,
    governance_weight: pub Field,
    private_nonce: Field,
) {
    // DEMO rewards-weight circuit (recursive-integration wiring only). It only
    // checks the shape/non-zero of its inputs; it does NOT prove the weights are
    // correct, nor bind them to on-chain reward state or a Poseidon2 commitment
    // (L11). `user`/weights are PUBLIC inputs and should become private witnesses
    // behind a commitment before any live wiring (L14).
    assert(user != 0);
    assert(private_nonce != 0);
    assert((deposit_weight + fsft_weight + governance_weight) != 0);
    // `epoch` may be zero (first epoch), so it is intentionally unconstrained
    // here. (Removed the prior no-op `assert(epoch == epoch)` -- L10.)
}
