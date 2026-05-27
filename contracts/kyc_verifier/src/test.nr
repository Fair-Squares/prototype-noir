use crate::KYCVerifier;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

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
