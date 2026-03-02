fn main(owner: pub Field, signal: pub Field, private_balance_hint: Field) {
    // Demo circuit for recursive integration: caller identity + holder signal.
    // This does not bind to on-chain note state yet.
    assert(owner != 0);
    assert(signal == 1);
    assert(private_balance_hint != 0);
}
