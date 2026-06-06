use crate::HousingFund;
use governance::Governance;
use kyc_verifier::KYCVerifier;
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
    // deposit record.
    env.call_public(admin, HousingFund::at(addr).reinvest_rent(0, 0));
}

// -- Cross-contract PUBLIC E2E (KYCVerifier + HousingFund) --------------------
// Deploys KYCVerifier alongside HousingFund, makes a user an investor via the
// public register_kyc path, then exercises deposit -> record_rent ->
// open_rent_distribution -> reinvest_rent end to end. This is the previously
// deferred "Task 22" E2E, made tractable on the PUBLIC path (no private-note
// hinting): public deposit() creates a public deposit record claimable by seq.
// The PRIVATE paths (deposit_private / claim_rent_private / reinvest_rent_private)
// still need hinted notes and remain deferred.

unconstrained fn setup_with_investor() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let user = env.create_light_account();
    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    let hf = env.deploy("HousingFund").with_public_initializer(
        admin,
        HousingFund::interface().constructor(admin),
    );
    // Wire KYC into the fund; the other links are unused by this flow, so admin
    // stands in as a harmless placeholder.
    env.call_public(admin, HousingFund::at(hf).set_contracts(kyc, admin, admin, admin));
    // admin is the constructor-seeded verifier, so it can register the investor.
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(user));
    (env, hf, admin, user)
}

#[test]
unconstrained fn test_reinvest_rent_public_e2e() {
    let (mut env, hf, admin, user) = setup_with_investor();

    // user deposits 10,000 (== small threshold, so it is a "small" depositor) ->
    // public deposit record seq 0 with cum_before 0.
    env.call_public(user, HousingFund::at(hf).deposit(10000));

    // admin records 600 rent and opens an epoch for it.
    env.call_public(admin, HousingFund::at(hf).record_rent(1, 600));
    env.call_public(admin, HousingFund::at(hf).open_rent_distribution(0, 600));

    // Sole small depositor reinvests their share of the whole pool:
    //   small_pool = 600*3000/10000 = 180 ; fifo_cap = 420
    //   share = fifo_share(0,10000,420)=420 + small_share=180 = 600.
    env.call_public(user, HousingFund::at(hf).reinvest_rent(0, 0));

    // Reinvested rent re-enters as capital: deposits 10,000 -> 10,600.
    assert_eq(env.execute_utility(HousingFund::at(hf).get_rent_reinvested(user)), 600);
    assert_eq(env.execute_utility(HousingFund::at(hf).get_total_deposits()), 10600);
    // Rent left the pool (reinvested), so rent-in-fund drains to zero.
    assert_eq(env.execute_utility(HousingFund::at(hf).get_total_rent_claimed()), 600);
    assert_eq(env.execute_utility(HousingFund::at(hf).get_rent_in_fund()), 0);
    // Withdraw side of the ledger is untouched.
    assert_eq(env.execute_utility(HousingFund::at(hf).get_rent_withdrawn(user)), 0);
}

#[test(should_fail_with = "already claimed")]
unconstrained fn test_cannot_withdraw_after_reinvest_same_record() {
    let (mut env, hf, admin, user) = setup_with_investor();
    env.call_public(user, HousingFund::at(hf).deposit(10000));
    env.call_public(admin, HousingFund::at(hf).record_rent(1, 600));
    env.call_public(admin, HousingFund::at(hf).open_rent_distribution(0, 600));
    env.call_public(user, HousingFund::at(hf).reinvest_rent(0, 0));
    // The (seq 0, epoch 0) record is consumed; withdrawing it now must revert
    // before the EUR path is even reached.
    env.call_public(user, HousingFund::at(hf).claim_rent(0, 0));
}

// -- W1c: affordability covenant ENFORCEMENT (record_rent ceiling) -----------
//
// Deploys a real Governance so the fund can sync a proposal's covenant, then
// proves record_rent caps keeper-posted rent at the covenant ceiling. The
// property the rent is posted against is the proposal id (property_id ==
// proposal_id). property 0 has a 3.5%/yr ceiling on a EUR 500,000 acquisition,
// so the monthly cap is 500000 * 350 / 10000 / 12 = 1458.

unconstrained fn setup_with_covenant(
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let proposer = env.create_light_account();
    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    let hf = env.deploy("HousingFund").with_public_initializer(
        admin,
        HousingFund::interface().constructor(admin),
    );
    // Governance needs the fund address up front; the fund learns governance via
    // set_contracts. fund_token is unused here, so admin stands in.
    let gov = env.deploy("Governance").with_public_initializer(
        admin,
        Governance::interface().constructor(hf, kyc, admin, 300, 2),
    );
    env.call_public(admin, HousingFund::at(hf).set_contracts(kyc, admin, admin, gov));
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(proposer));

    // Proposal 0 with a 3.5%/yr ceiling and a 20-year lock.
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(1), 1000));
    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)),
    );
    // The fund knows property 0 cost EUR 500,000 and pulls proposal 0's covenant.
    env.call_public(admin, HousingFund::at(hf).set_acquisition_value(0, 500000));
    env.call_public(admin, HousingFund::at(hf).sync_proposal_covenant(0));
    (env, hf, gov, admin, proposer)
}

#[test]
unconstrained fn test_sync_proposal_covenant_records_terms() {
    let (env, hf, _gov, _admin, _proposer) = setup_with_covenant();
    let (is_set, ceiling_bps, lock_years) =
        env.execute_utility(HousingFund::at(hf).get_property_covenant(0));
    assert(is_set);
    assert_eq(ceiling_bps, 350);
    assert_eq(lock_years, 20);
}

#[test]
unconstrained fn test_record_rent_under_covenant_ceiling_ok() {
    let (mut env, hf, _gov, admin, _proposer) = setup_with_covenant();
    // EUR 1,000 <= EUR 1,458 monthly cap -> accepted.
    env.call_public(admin, HousingFund::at(hf).record_rent(0, 1000));
    assert_eq(env.execute_utility(HousingFund::at(hf).get_total_rent_income()), 1000);
}

#[test(should_fail_with = "rent exceeds affordability covenant ceiling")]
unconstrained fn test_record_rent_over_covenant_ceiling_fails() {
    let (mut env, hf, _gov, admin, _proposer) = setup_with_covenant();
    // EUR 5,000 > EUR 1,458 monthly cap -> rejected by the covenant.
    env.call_public(admin, HousingFund::at(hf).record_rent(0, 5000));
}

#[test]
unconstrained fn test_record_rent_uncovenanted_property_unenforced() {
    let (mut env, hf, _gov, admin, _proposer) = setup_with_covenant();
    // Property 1 has no synced covenant, so the ceiling does not apply.
    env.call_public(admin, HousingFund::at(hf).record_rent(1, 999999));
    assert_eq(env.execute_utility(HousingFund::at(hf).get_total_rent_income()), 999999);
}

#[test(should_fail_with = "proposal has no covenant")]
unconstrained fn test_sync_requires_a_covenant() {
    let (mut env, hf, gov, _admin, proposer) = setup_with_covenant();
    // Proposal 1 exists but never had a covenant attached -> sync reverts.
    // (proposer is the KYC-registered investor, so create_proposal is allowed.)
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(2), 500));
    env.call_public(proposer, HousingFund::at(hf).sync_proposal_covenant(1));
}
