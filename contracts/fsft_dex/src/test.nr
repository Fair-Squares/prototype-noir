use crate::FSFTDex;
use kyc_verifier::KYCVerifier;
use housing_fund::HousingFund;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Lightweight setup: FSFTDex with placeholder (light-account) links. Enough for
/// constructor / settlement-token / risk-policy auth assertions.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let kyc_verifier = env.create_light_account();
    let housing_fund = env.create_light_account();
    let fsft_token = env.create_light_account();
    let eur_token = env.create_light_account();

    let initializer_call = FSFTDex::interface().constructor(
        admin,
        kyc_verifier,
        housing_fund,
        fsft_token,
        eur_token,
        200, // price_band_bps
        120, // max_ttl_blocks
    );
    let addr = env.deploy("FSFTDex").with_public_initializer(admin, initializer_call);
    (env, addr, admin)
}

#[test]
unconstrained fn test_settlement_tokens_wired() {
    let (env, addr, _admin) = setup();
    let tokens = env.view_public(FSFTDex::at(addr).get_settlement_tokens());
    assert(!tokens.fsft_token.is_zero());
    assert(!tokens.eur_token.is_zero());
}

#[test]
unconstrained fn test_order_count_starts_zero() {
    let (env, addr, _admin) = setup();
    assert_eq(env.execute_utility(FSFTDex::at(addr).get_order_count()), 0);
}

// -- set_risk_policy guards ---------------------------------------------------

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_risk_policy_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, FSFTDex::at(addr).set_risk_policy(300, 60));
}

#[test(should_fail_with = "invalid price band")]
unconstrained fn test_set_risk_policy_rejects_zero_band() {
    let (env, addr, admin) = setup();
    env.call_public(admin, FSFTDex::at(addr).set_risk_policy(0, 60));
}

#[test(should_fail_with = "invalid max ttl")]
unconstrained fn test_set_risk_policy_rejects_zero_ttl() {
    let (env, addr, admin) = setup();
    env.call_public(admin, FSFTDex::at(addr).set_risk_policy(200, 0));
}

// -- Cross-contract views (real KYCVerifier + HousingFund) --------------------
// get_orderbook_snapshot reads HousingFund.get_valuation_public and can_trade
// reads KYCVerifier.is_investor, so both need real linked contracts. The order
// PLACEMENT / MATCH / CANCEL / CLAIM flows are private (hinted KYC note + token
// escrow + authwit) and remain deferred as a full private E2E.
unconstrained fn setup_linked() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let fsft_token = env.create_light_account();
    let eur_token = env.create_light_account();

    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    let hf = env.deploy("HousingFund").with_public_initializer(
        admin,
        HousingFund::interface().constructor(admin),
    );
    let dex = env.deploy("FSFTDex").with_public_initializer(
        admin,
        FSFTDex::interface().constructor(admin, kyc, hf, fsft_token, eur_token, 200, 120),
    );
    (env, dex, admin, kyc)
}

#[test]
unconstrained fn test_orderbook_snapshot_defaults() {
    let (env, dex, _admin, _kyc) = setup_linked();
    let snap = env.view_public(FSFTDex::at(dex).get_orderbook_snapshot());
    // No valuation posted yet -> ref price defaults to par (10000 bps). With a
    // 200 bps band: min = 10000*9800/10000 = 9800, max = 10000*10200/10000 = 10200.
    assert_eq(snap.ref_price_bps, 10000);
    assert_eq(snap.min_price_bps, 9800);
    assert_eq(snap.max_price_bps, 10200);
    assert_eq(snap.price_band_bps, 200);
    assert_eq(snap.max_ttl_blocks, 120);
    assert_eq(snap.order_count, 0);
}

#[test]
unconstrained fn test_set_risk_policy_updates_snapshot() {
    let (mut env, dex, admin, _kyc) = setup_linked();
    env.call_public(admin, FSFTDex::at(dex).set_risk_policy(300, 60));
    let snap = env.view_public(FSFTDex::at(dex).get_orderbook_snapshot());
    assert_eq(snap.price_band_bps, 300);
    assert_eq(snap.max_ttl_blocks, 60);
    // 300 bps band around par: min = 9700, max = 10300.
    assert_eq(snap.min_price_bps, 9700);
    assert_eq(snap.max_price_bps, 10300);
}

// -- Price band predicate (the placement-time guard's shared math) ------------
// _place_and_match enforces "price out of band" via price_band_bounds, but that
// public tail is #[only_self] and reached only through the private place_order
// leg (hinted KYC note + token escrow + authwit) -- which TestEnvironment cannot
// drive -- so the negative REVERT is exercised in the TS e2e
// (scripts/e2e/dex-order.e2e.ts). Here we pin the identical band math the guard
// uses, through the is_price_in_band view that shares price_band_bounds.

#[test]
unconstrained fn test_price_in_band_accepts_within_and_boundaries() {
    let (env, dex, _admin, _kyc) = setup_linked();
    // No valuation posted -> ref = par (10000); 200 bps band -> [9800, 10200].
    assert(env.view_public(FSFTDex::at(dex).is_price_in_band(10000))); // mid
    assert(env.view_public(FSFTDex::at(dex).is_price_in_band(9800))); // min edge
    assert(env.view_public(FSFTDex::at(dex).is_price_in_band(10200))); // max edge
}

#[test]
unconstrained fn test_price_in_band_rejects_out_of_band() {
    let (env, dex, _admin, _kyc) = setup_linked();
    // Just outside [9800, 10200], plus fat-finger extremes the guard must reject.
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(9799)));
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(10201)));
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(1)));
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(100000)));
}

#[test]
unconstrained fn test_price_band_follows_risk_policy() {
    let (mut env, dex, admin, _kyc) = setup_linked();
    env.call_public(admin, FSFTDex::at(dex).set_risk_policy(300, 60));
    // 300 bps band around par -> [9700, 10300].
    assert(env.view_public(FSFTDex::at(dex).is_price_in_band(9700)));
    assert(env.view_public(FSFTDex::at(dex).is_price_in_band(10300)));
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(9699)));
    assert(!env.view_public(FSFTDex::at(dex).is_price_in_band(10301)));
}

#[test]
unconstrained fn test_can_trade_reflects_kyc() {
    let (mut env, dex, admin, kyc) = setup_linked();
    let user = env.create_light_account();
    // Unregistered user cannot trade.
    assert(!env.view_public(FSFTDex::at(dex).can_trade(user)));
    // admin is the constructor-seeded verifier, so it can register the investor.
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(user));
    assert(env.view_public(FSFTDex::at(dex).can_trade(user)));
}
