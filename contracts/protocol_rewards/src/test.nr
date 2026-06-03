use crate::ProtocolRewards;
use kyc_verifier::KYCVerifier;
use token_contract::Token;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Lightweight setup: ProtocolRewards deployed with placeholder (light-account)
/// links. Sufficient for constructor / config / auth-gate assertions whose
/// guards fire BEFORE any cross-contract token read.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let fsft_token = env.create_light_account();
    let housing_fund = env.create_light_account();
    let governance = env.create_light_account();
    let kyc_verifier = env.create_light_account();

    // protocol_token is wired post-deploy via set_protocol_token (the AIP-20
    // minter is immutable, so the token must be deployed after this contract).
    let initializer_call = ProtocolRewards::interface().constructor(
        admin,
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

// -- Config / constructor invariants -----------------------------------------

#[test]
unconstrained fn test_rewards_config_defaults() {
    let (env, addr, _admin) = setup();
    let cfg = env.view_public(ProtocolRewards::at(addr).get_rewards_config());
    assert_eq(cfg.total_distribution_pool, 8_000_000);
    assert_eq(cfg.total_distributed, 0);
    assert_eq(cfg.total_claimed, 0);
    assert_eq(cfg.total_epochs, 120);
    assert_eq(cfg.claim_min, 1);
}

// The emission-schedule ladder mirrored by the frontend
// (`simulationStore.ts` YEAR_SPLITS_BPS). Year 0 = 1300 bps, year 1 = 1200 bps,
// each spread over 12 epochs of an 8,000,000 pool:
//   epoch 0:  8_000_000 * 1300 / 10000 / 12 = 86_666
//   epoch 12: 8_000_000 * 1200 / 10000 / 12 = 80_000
#[test]
unconstrained fn test_epoch_target_follows_emission_schedule() {
    let (env, addr, _admin) = setup();
    assert_eq(env.view_public(ProtocolRewards::at(addr).get_epoch_target(0)), 86_666);
    assert_eq(env.view_public(ProtocolRewards::at(addr).get_epoch_target(11)), 86_666);
    assert_eq(env.view_public(ProtocolRewards::at(addr).get_epoch_target(12)), 80_000);
}

#[test]
unconstrained fn test_user_stats_start_zero() {
    let (mut env, addr, _admin) = setup();
    let user = env.create_light_account();
    assert_eq(env.view_public(ProtocolRewards::at(addr).get_claimable(user)), 0);
    let stats = env.view_public(ProtocolRewards::at(addr).get_user_stats(user));
    assert_eq(stats.claimable, 0);
    assert_eq(stats.total_claimed, 0);
}

// -- checkpoint_epoch guards --------------------------------------------------

#[test]
unconstrained fn test_checkpoint_epoch_by_admin() {
    let (env, addr, admin) = setup();
    env.call_public(admin, ProtocolRewards::at(addr).checkpoint_epoch(0, 1000, 100, 100, 100));
    let s = env.view_public(ProtocolRewards::at(addr).get_epoch_stats(0));
    assert(s.open);
    assert_eq(s.emission, 1000);
    assert_eq(s.deposit_total_weight, 100);
    let cfg = env.view_public(ProtocolRewards::at(addr).get_rewards_config());
    assert_eq(cfg.total_distributed, 1000);
    assert_eq(cfg.current_epoch, 0);
}

#[test(should_fail_with = "not admin")]
unconstrained fn test_checkpoint_epoch_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, ProtocolRewards::at(addr).checkpoint_epoch(0, 1000, 100, 100, 100));
}

#[test(should_fail_with = "emission must be positive")]
unconstrained fn test_checkpoint_epoch_rejects_zero_emission() {
    let (env, addr, admin) = setup();
    env.call_public(admin, ProtocolRewards::at(addr).checkpoint_epoch(0, 0, 100, 100, 100));
}

#[test(should_fail_with = "emission exceeds epoch target")]
unconstrained fn test_checkpoint_epoch_rejects_over_target() {
    let (env, addr, admin) = setup();
    // epoch-0 target is 86_666; 90_000 exceeds it.
    env.call_public(admin, ProtocolRewards::at(addr).checkpoint_epoch(0, 90_000, 100, 100, 100));
}

#[test(should_fail_with = "invalid epoch")]
unconstrained fn test_checkpoint_epoch_rejects_out_of_range() {
    let (env, addr, admin) = setup();
    // total_epochs == 120, so epoch 120 is out of range.
    env.call_public(admin, ProtocolRewards::at(addr).checkpoint_epoch(120, 1000, 100, 100, 100));
}

// -- set_protocol_token lifecycle --------------------------------------------

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_protocol_token_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, ProtocolRewards::at(addr).set_protocol_token(stranger));
}

#[test(should_fail_with = "protocol token already set")]
unconstrained fn test_set_protocol_token_is_one_shot() {
    let (mut env, addr, admin) = setup();
    let tok = env.create_light_account();
    env.call_public(admin, ProtocolRewards::at(addr).set_protocol_token(tok));
    let tok2 = env.create_light_account();
    env.call_public(admin, ProtocolRewards::at(addr).set_protocol_token(tok2));
}

// -- set_user_epoch_weights guards (fire before the FSFT balance read) --------

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_user_epoch_weights_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, ProtocolRewards::at(addr).set_user_epoch_weights(0, stranger, 1, 1, 1));
}

#[test(should_fail_with = "epoch not open")]
unconstrained fn test_set_user_epoch_weights_requires_open_epoch() {
    let (mut env, addr, admin) = setup();
    let user = env.create_light_account();
    // epoch 5 was never checkpointed, so it is not open.
    env.call_public(admin, ProtocolRewards::at(addr).set_user_epoch_weights(5, user, 1, 1, 1));
}

// -- Cross-contract PUBLIC E2E: checkpoint -> allocate -> claim ----------------
// Deploys a real FSFT Token (so the FSFT-eligibility balance read resolves), a
// real KYCVerifier (so the public claim's investor gate resolves), and a real
// protocol Token whose immutable minter IS this rewards contract (so claim can
// mint). This exercises the previously deferred public reward path end to end.
// The PRIVATE path (allocate_reward_private / claim_reward_private) still needs
// hinted reward notes and remains deferred.
unconstrained fn setup_full() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let user = env.create_light_account();

    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    // Real FSFT token with public supply minted to `user` so the FSFT-reward
    // eligibility check (balance_of_public(user) > 0) is satisfied.
    let fsft = env.deploy("Token").with_public_initializer(
        admin,
        Token::interface().constructor_with_initial_supply(
            "TestToken0000000000000000000000",
            "TT00000000000000000000000000000",
            18,
            1000,
            user,
        ),
    );
    // housing_fund / governance links are unused by this flow -> admin placeholder.
    let rewards = env.deploy("ProtocolRewards").with_public_initializer(
        admin,
        ProtocolRewards::interface().constructor(admin, fsft, admin, admin, kyc, 1),
    );
    // Protocol token minted on claim; its immutable minter must be the rewards
    // contract (deployed above), so it is deployed after and wired in.
    let ptok = env.deploy("Token").with_public_initializer(
        admin,
        Token::interface().constructor_with_minter(
            "TestToken0000000000000000000000",
            "TT00000000000000000000000000000",
            18,
            rewards,
        ),
    );
    env.call_public(admin, ProtocolRewards::at(rewards).set_protocol_token(ptok));
    // admin is the constructor-seeded KYC verifier, so it can register the user.
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(user));
    (env, rewards, admin, user, ptok)
}

#[test]
unconstrained fn test_set_user_epoch_weights_allocates_pro_rata() {
    let (mut env, rewards, admin, user, _ptok) = setup_full();
    env.call_public(admin, ProtocolRewards::at(rewards).checkpoint_epoch(0, 1000, 100, 100, 100));
    // Sole participant takes the whole epoch emission across all three sub-pools:
    //   deposit_pool=400, fsft_pool=400, governance_pool=200 -> reward = 1000.
    env.call_public(
        admin,
        ProtocolRewards::at(rewards).set_user_epoch_weights(0, user, 100, 100, 100),
    );
    assert_eq(env.view_public(ProtocolRewards::at(rewards).get_claimable(user)), 1000);
    let s = env.view_public(ProtocolRewards::at(rewards).get_epoch_stats(0));
    assert_eq(s.allocated, 1000);
}

#[test(should_fail_with = "already allocated")]
unconstrained fn test_set_user_epoch_weights_is_once_per_epoch() {
    let (mut env, rewards, admin, user, _ptok) = setup_full();
    env.call_public(admin, ProtocolRewards::at(rewards).checkpoint_epoch(0, 1000, 100, 100, 100));
    env.call_public(admin, ProtocolRewards::at(rewards).set_user_epoch_weights(0, user, 100, 100, 100));
    // Second allocation for the same (user, epoch) must be rejected.
    env.call_public(admin, ProtocolRewards::at(rewards).set_user_epoch_weights(0, user, 100, 100, 100));
}

#[test]
unconstrained fn test_public_claim_mints_and_zeroes_claimable() {
    let (mut env, rewards, admin, user, _ptok) = setup_full();
    env.call_public(admin, ProtocolRewards::at(rewards).checkpoint_epoch(0, 1000, 100, 100, 100));
    env.call_public(admin, ProtocolRewards::at(rewards).set_user_epoch_weights(0, user, 100, 100, 100));
    assert_eq(env.view_public(ProtocolRewards::at(rewards).get_claimable(user)), 1000);

    env.call_public(user, ProtocolRewards::at(rewards).claim());

    assert_eq(env.view_public(ProtocolRewards::at(rewards).get_claimable(user)), 0);
    let stats = env.view_public(ProtocolRewards::at(rewards).get_user_stats(user));
    assert_eq(stats.total_claimed, 1000);
    let cfg = env.view_public(ProtocolRewards::at(rewards).get_rewards_config());
    assert_eq(cfg.total_claimed, 1000);
}

#[test(should_fail_with = "investor role required")]
unconstrained fn test_public_claim_requires_investor() {
    let (mut env, rewards, admin, _user, _ptok) = setup_full();
    env.call_public(admin, ProtocolRewards::at(rewards).checkpoint_epoch(0, 1000, 100, 100, 100));
    // A stranger who was never KYC-registered cannot claim.
    let stranger = env.create_light_account();
    env.call_public(stranger, ProtocolRewards::at(rewards).claim());
}
