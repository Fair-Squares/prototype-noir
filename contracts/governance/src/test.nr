use crate::Governance;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Constructor smoke test. Full V2 secret-ballot end-to-end (issue KYC,
/// deposit, then cast_vote_private with both hinted notes) requires
/// multi-contract test setup; left as a follow-up under Task 22.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let housing_fund = env.create_light_account();
    let kyc_verifier = env.create_light_account();
    let fund_token = env.create_light_account();

    let initializer_call = Governance::interface().constructor(
        housing_fund,
        kyc_verifier,
        fund_token,
        300, // voting_window_blocks
        2,   // min_quorum_votes
    );
    let addr = env.deploy("Governance").with_public_initializer(admin, initializer_call);
    (env, addr, admin)
}

#[test]
unconstrained fn test_proposal_count_starts_at_zero() {
    let (env, addr, _admin) = setup();
    let count = env.execute_utility(Governance::at(addr).get_proposal_count());
    assert_eq(count, 0);
}

#[test]
unconstrained fn test_voting_window_blocks_set() {
    let (env, addr, _admin) = setup();
    let window = env.execute_utility(Governance::at(addr).get_voting_window_blocks());
    assert_eq(window, 300);
}
