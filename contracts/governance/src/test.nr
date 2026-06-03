use crate::Governance;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};
use kyc_verifier::KYCVerifier;

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

// -- Cross-contract create_proposal lifecycle (KYCVerifier + Governance) ------
// Deploys a real KYCVerifier so create_proposal's `is_investor(caller)` view
// resolves on-chain, then exercises the proposal-creation lifecycle on the
// PUBLIC path. The secret-ballot vote flow (cast_vote_private) needs hinted KYC
// + deposit notes; the happy / double-vote / revocation / tie outcomes that
// depend on it remain deferred under Task 22 alongside the other private-note
// E2Es, since no public entrypoint writes the yes/no tally.
unconstrained fn setup_with_investor() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let proposer = env.create_light_account();
    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    // housing_fund / fund_token are unused by the create_proposal path, so admin
    // stands in as a harmless placeholder. Quorum 2, window 300 blocks.
    let gov = env.deploy("Governance").with_public_initializer(
        admin,
        Governance::interface().constructor(admin, kyc, admin, 300, 2),
    );
    // admin is the constructor-seeded verifier, so it can register the investor.
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(proposer));
    (env, gov, admin, proposer)
}

#[test]
unconstrained fn test_create_proposal_by_investor_opens_active() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();

    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));

    assert_eq(env.execute_utility(Governance::at(gov).get_proposal_count()), 1);
    // proposal 0 starts ACTIVE (STATUS_ACTIVE == 0).
    assert_eq(env.execute_utility(Governance::at(gov).get_proposal_status(0)), 0);
    let view = env.execute_utility(Governance::at(gov).get_proposal(0));
    assert_eq(view.desc_hash, Field::from(42));
    assert_eq(view.amount, 1000);
    assert_eq(view.status, 0);
    assert_eq(view.yes_votes, 0);
    assert_eq(view.no_votes, 0);
}

#[test(should_fail_with = "investor role required")]
unconstrained fn test_create_proposal_rejects_non_investor() {
    let (mut env, gov, _admin, _proposer) = setup_with_investor();
    let stranger = env.create_light_account();
    // stranger was never registered as a KYC investor.
    env.call_public(stranger, Governance::at(gov).create_proposal(Field::from(7), 500));
}
