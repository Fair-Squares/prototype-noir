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

// -- Phase 1.1: rent ingestion ------------------------------------------------

#[test]
unconstrained fn test_total_rent_income_starts_zero() {
    let (env, addr, _admin) = setup();
    let total = env.execute_utility(HousingFund::at(addr).get_total_rent_income());
    assert_eq(total, 0);
}

#[test]
unconstrained fn test_record_rent_by_admin_accrues_per_property_and_total() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 500));
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 250));
    env.call_public(admin, HousingFund::at(addr).record_rent(2, 100));

    let total = env.execute_utility(HousingFund::at(addr).get_total_rent_income());
    assert_eq(total, 850);
    let p1 = env.execute_utility(HousingFund::at(addr).get_property_rent(1));
    assert_eq(p1, 750);
    let p2 = env.execute_utility(HousingFund::at(addr).get_property_rent(2));
    assert_eq(p2, 100);
}

#[test(should_fail_with = "not authorized to record rent")]
unconstrained fn test_record_rent_unauthorized_fails() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, HousingFund::at(addr).record_rent(1, 500));
}

#[test(should_fail_with = "rent amount must be positive")]
unconstrained fn test_record_rent_zero_amount_fails() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 0));
}

#[test]
unconstrained fn test_designated_keeper_can_record_rent() {
    let (mut env, addr, admin) = setup();
    let keeper = env.create_light_account();
    env.call_public(admin, HousingFund::at(addr).set_rent_keeper(keeper));
    env.call_public(keeper, HousingFund::at(addr).record_rent(7, 1200));

    let total = env.execute_utility(HousingFund::at(addr).get_total_rent_income());
    assert_eq(total, 1200);
    let stored_keeper = env.execute_utility(HousingFund::at(addr).get_rent_keeper());
    assert_eq(stored_keeper, keeper);
}
