use crate::ProtocolRewards;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Constructor smoke test. Full V2 allocate_reward_private +
/// claim_reward_private end-to-end requires deploying a FundToken
/// instance as protocol_token and setting its admin to this contract;
/// left as a follow-up under Task 22.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let protocol_token = env.create_light_account();
    let fsft_token = env.create_light_account();
    let housing_fund = env.create_light_account();
    let governance = env.create_light_account();
    let kyc_verifier = env.create_light_account();

    let initializer_call = ProtocolRewards::interface().constructor(
        admin,
        protocol_token,
        fsft_token,
        housing_fund,
        governance,
        kyc_verifier,
        1, // claim_min
    );
    let addr = env.deploy("ProtocolRewards").with_public_initializer(admin, initializer_call);
    (env, addr, admin)
}

#[test]
unconstrained fn test_current_epoch_starts_at_zero() {
    let (env, addr, _admin) = setup();
    let stats = env.view_public(ProtocolRewards::at(addr).get_rewards_config());
    assert_eq(stats.current_epoch, 0);
    assert_eq(stats.total_distributed, 0);
}
