use crate::FSFTDex;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Constructor smoke test. Full V2 place_order_private + match +
/// cancel_order_private end-to-end requires deploying KYCVerifier +
/// HousingFund + FundToken (FSFT + EUR) alongside and threading the
/// hinted KYC credential; left as a follow-up under Task 22.
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
unconstrained fn test_order_count_starts_at_zero() {
    let (env, addr, _admin) = setup();
    let count = env.execute_utility(FSFTDex::at(addr).get_order_count());
    assert_eq(count, 0);
}
