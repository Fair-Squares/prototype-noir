use crate::HousingFund;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Constructor smoke test. Full V2 end-to-end (issue KYC credential ->
/// deposit_private -> assert total_deposits bumped) requires deploying
/// KYCVerifier alongside and threading the hinted credential note; that
/// is left as a follow-up under Task 22.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let initializer_call = HousingFund::interface().constructor(admin);
    let addr = env.deploy("HousingFund").with_public_initializer(admin, initializer_call);
    (env, addr, admin)
}

#[test]
unconstrained fn test_constructor_initialises_aggregates_to_zero() {
    let (env, addr, _admin) = setup();
    let total = env.execute_utility(HousingFund::at(addr).get_total_deposits());
    assert_eq(total, 0);
}

#[test]
unconstrained fn test_is_paused_starts_false() {
    let (env, addr, _admin) = setup();
    let paused = env.execute_utility(HousingFund::at(addr).is_paused());
    assert_eq(paused, false);
}
