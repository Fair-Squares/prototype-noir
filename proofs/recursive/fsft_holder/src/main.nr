fn main(owner: pub Field, signal: pub Field, private_balance_hint: Field) {
    // DEMO circuit (recursive-integration wiring only). It does NOT prove FSFT
    // holdership: it only checks the shape/non-zero of its inputs. It is not
    // bound to any on-chain note, balance, or Poseidon2 commitment (L11), and
    // exposes `owner`/`signal` as PUBLIC inputs -- an identity leak that must be
    // closed (make identity a private witness, expose only a commitment) before
    // any live wiring (L14).
    assert(owner != 0);
    // `signal` is a hardcoded placeholder constant, not bound to real holder
    // state. Bind it to a proven balance/commitment before relying on it (L31).
    assert(signal == 1);
    assert(private_balance_hint != 0);
}
