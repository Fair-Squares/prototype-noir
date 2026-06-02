use crate::KYCVerifier;
use aztec::{
    protocol::{address::AztecAddress, hash::poseidon2_hash, traits::ToField},
    test::helpers::test_environment::TestEnvironment,
};

/// Shared setup: deploy KYCVerifier with `admin` as both contract admin and
/// the initial (sole) verifier.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let initializer_call = KYCVerifier::interface().constructor(admin);
    let kyc_addr = env.deploy("KYCVerifier").with_public_initializer(admin, initializer_call);
    (env, kyc_addr, admin)
}

#[test]
unconstrained fn test_issue_credential_bumps_verified_count() {
    let (mut env, kyc_addr, admin) = setup();
    let alice = env.create_light_account();
    let nonce = Field::from(7);

    env.call_private(admin, KYCVerifier::at(kyc_addr).issue_credential(alice, nonce));

    let count = env.execute_utility(KYCVerifier::at(kyc_addr).get_verified_count());
    assert_eq(count, 1);
}

#[test(should_fail_with = "caller is not an authorised verifier")]
unconstrained fn test_issue_credential_rejects_non_verifier() {
    let (mut env, kyc_addr, _admin) = setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let nonce = Field::from(99);

    // bob is not in the verifiers map; the enqueued _assert_is_verifier
    // should revert the entire tx.
    env.call_private(bob, KYCVerifier::at(kyc_addr).issue_credential(alice, nonce));
}

#[test]
unconstrained fn test_revoke_credential_flips_view() {
    let (mut env, kyc_addr, admin) = setup();
    let alice = env.create_light_account();
    let nonce = Field::from(11);
    let commitment = env.execute_utility(
        KYCVerifier::at(kyc_addr).compute_revocation_commitment(alice, nonce),
    );

    let before = env.view_public(KYCVerifier::at(kyc_addr).is_credential_revoked(commitment));
    assert_eq(before, false);

    env.call_public(admin, KYCVerifier::at(kyc_addr).revoke_credential(commitment));

    let after = env.view_public(KYCVerifier::at(kyc_addr).is_credential_revoked(commitment));
    assert_eq(after, true);
}

// COMMITMENT-PARITY (L30/Task-22): the unconstrained
// compute_revocation_commitment helper must return exactly the value the
// consuming contracts recompute IN-CIRCUIT, `poseidon2([owner, nonce])`. If
// these ever diverge an off-chain revocation would silently fail to bind.
#[test]
unconstrained fn test_commitment_parity_matches_in_circuit_hash() {
    let (env, kyc_addr, _admin) = setup();
    let alice = env.create_light_account();
    let nonce = Field::from(11);

    let helper = env.execute_utility(
        KYCVerifier::at(kyc_addr).compute_revocation_commitment(alice, nonce),
    );
    let expected = poseidon2_hash([alice.to_field(), nonce]);
    assert_eq(helper, expected);
}

// Distinct (owner, nonce) pairs must yield distinct commitments so a single
// revocation can never collaterally revoke an unrelated credential.
#[test]
unconstrained fn test_commitment_is_nonce_sensitive() {
    let (env, kyc_addr, _admin) = setup();
    let alice = env.create_light_account();

    let c1 = env.execute_utility(
        KYCVerifier::at(kyc_addr).compute_revocation_commitment(alice, Field::from(1)),
    );
    let c2 = env.execute_utility(
        KYCVerifier::at(kyc_addr).compute_revocation_commitment(alice, Field::from(2)),
    );
    assert(c1 != c2);
}

// V1 registry path: a verifier (admin is the bootstrap verifier) registers a
// user, granting both verified status and the investor role; revoke_kyc clears
// both and decrements the count.
#[test]
unconstrained fn test_register_then_revoke_kyc_round_trips_role() {
    let (mut env, kyc_addr, admin) = setup();
    let alice = env.create_light_account();

    env.call_public(admin, KYCVerifier::at(kyc_addr).register_kyc(alice));
    assert_eq(env.view_public(KYCVerifier::at(kyc_addr).is_verified(alice)), true);
    assert_eq(env.view_public(KYCVerifier::at(kyc_addr).is_investor(alice)), true);
    assert_eq(env.execute_utility(KYCVerifier::at(kyc_addr).get_verified_count()), 1);

    env.call_public(admin, KYCVerifier::at(kyc_addr).revoke_kyc(alice));
    assert_eq(env.view_public(KYCVerifier::at(kyc_addr).is_verified(alice)), false);
    assert_eq(env.view_public(KYCVerifier::at(kyc_addr).is_investor(alice)), false);
    assert_eq(env.execute_utility(KYCVerifier::at(kyc_addr).get_verified_count()), 0);
}

// register_kyc is verifier-gated: a non-verifier caller must revert.
#[test(should_fail_with = "caller is not an authorised verifier")]
unconstrained fn test_register_kyc_rejects_non_verifier() {
    let (mut env, kyc_addr, _admin) = setup();
    let mallory = env.create_light_account();
    let alice = env.create_light_account();

    env.call_public(mallory, KYCVerifier::at(kyc_addr).register_kyc(alice));
}
