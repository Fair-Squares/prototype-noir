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

// -- Phase 1.1 step 2: rent distribution guards -------------------------------

#[test]
unconstrained fn test_rent_accounting_starts_zero() {
    let (env, addr, _admin) = setup();
    assert_eq(env.execute_utility(HousingFund::at(addr).get_undistributed_rent()), 0);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_total_rent_claimed()), 0);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_rent_in_fund()), 0);
}

#[test]
unconstrained fn test_record_rent_tracks_undistributed_and_rent_in_fund() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 500));
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 250));
    // Nothing distributed yet, so undistributed == rent-in-fund == total collected.
    assert_eq(env.execute_utility(HousingFund::at(addr).get_undistributed_rent()), 750);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_rent_in_fund()), 750);
}

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_eur_token_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, HousingFund::at(addr).set_eur_token(stranger));
}

#[test(should_fail_with = "not authorized to open rent distribution")]
unconstrained fn test_open_rent_distribution_requires_admin_or_keeper() {
    let (mut env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 500));
    let stranger = env.create_light_account();
    env.call_public(stranger, HousingFund::at(addr).open_rent_distribution(0, 500));
}

#[test(should_fail_with = "amount exceeds undistributed rent")]
unconstrained fn test_open_rent_distribution_cannot_exceed_collected() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 500));
    env.call_public(admin, HousingFund::at(addr).open_rent_distribution(0, 600));
}

#[test(should_fail_with = "no deposits to distribute to")]
unconstrained fn test_open_rent_distribution_requires_deposits() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).record_rent(1, 500));
    // Within undistributed (500 <= 500) but no deposits exist, so the snapshot
    // guard fires -- proving the undistributed check passed first.
    env.call_public(admin, HousingFund::at(addr).open_rent_distribution(0, 500));
}

// -- Capped-return (ROR) + acquisition value ----------------------------------

#[test]
unconstrained fn test_ror_starts_zero() {
    let (env, addr, _admin) = setup();
    assert_eq(env.execute_utility(HousingFund::at(addr).get_ror_bps()), 0);
}

#[test]
unconstrained fn test_set_ror_bps_by_admin() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).set_ror_bps(300));
    assert_eq(env.execute_utility(HousingFund::at(addr).get_ror_bps()), 300);
}

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_ror_bps_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, HousingFund::at(addr).set_ror_bps(300));
}

#[test(should_fail_with = "ror bps out of range")]
unconstrained fn test_set_ror_bps_rejects_out_of_range() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).set_ror_bps(10001));
}

// The core capped-return primitive: rent = ROR * acquisition_value, paid
// monthly. Mirrors the canonical example (a EUR 500,000 home at ROR 3% ->
// EUR 15,000/yr -> EUR 1,250/mo, fully to investors). See CLAUDE.md.
#[test]
unconstrained fn test_expected_rent_from_ror_and_acquisition() {
    let (env, addr, admin) = setup();
    env.call_public(admin, HousingFund::at(addr).set_ror_bps(300)); // 3%
    env.call_public(admin, HousingFund::at(addr).set_acquisition_value(1, 500_000));

    assert_eq(env.execute_utility(HousingFund::at(addr).get_acquisition_value(1)), 500_000);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_expected_annual_rent(1)), 15_000);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_expected_monthly_rent(1)), 1_250);
    // A property with no acquisition value set yields zero expected rent (no
    // fabrication).
    assert_eq(env.execute_utility(HousingFund::at(addr).get_expected_monthly_rent(2)), 0);
}

#[test(should_fail_with = "not authorized to set acquisition value")]
unconstrained fn test_set_acquisition_value_requires_auth() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, HousingFund::at(addr).set_acquisition_value(1, 500_000));
}

#[test]
unconstrained fn test_keeper_can_set_acquisition_value() {
    let (mut env, addr, admin) = setup();
    let keeper = env.create_light_account();
    env.call_public(admin, HousingFund::at(addr).set_rent_keeper(keeper));
    env.call_public(keeper, HousingFund::at(addr).set_acquisition_value(3, 420_000));
    assert_eq(env.execute_utility(HousingFund::at(addr).get_acquisition_value(3)), 420_000);
}

// -- Withdraw-vs-reinvest ledger ----------------------------------------------

#[test]
unconstrained fn test_rent_ledger_starts_zero() {
    let (env, addr, admin) = setup();
    assert_eq(env.execute_utility(HousingFund::at(addr).get_rent_withdrawn(admin)), 0);
    assert_eq(env.execute_utility(HousingFund::at(addr).get_rent_reinvested(admin)), 0);
}

#[test(should_fail_with = "rent distribution is not open")]
unconstrained fn test_reinvest_rent_requires_open_epoch() {
    let (env, addr, admin) = setup();
    // No rent epoch opened, so reinvest fails the open guard before touching the
    // deposit record. (Full deposit -> record_rent -> open -> reinvest E2E needs
    // a KYC'd deposit and is deferred -- the repo's "Task 22" posture, same as
    // the claim_distribution tests.)
    env.call_public(admin, HousingFund::at(addr).reinvest_rent(0, 0));
}
