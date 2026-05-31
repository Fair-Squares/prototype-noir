use crate::DeFiVault;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

/// Deploy a DeFiVault with `admin` and an advertised 3% rate. No yield source is
/// wired, so the vault holds principal at par (zero yield) by default.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let initializer_call = DeFiVault::interface().constructor(admin, 300);
    let addr = env.deploy("DeFiVault").with_public_initializer(admin, initializer_call);
    (env, addr, admin)
}

#[test]
unconstrained fn test_starts_with_no_yield_and_no_source() {
    let (env, addr, _admin) = setup();
    let accrued = env.execute_utility(DeFiVault::at(addr).get_accrued_yield());
    assert_eq(accrued, 0);
    let source = env.execute_utility(DeFiVault::at(addr).get_yield_source());
    assert(source.is_zero());
}

// The whole point of Phase 1.1: nobody can fabricate yield. With no source
// configured, accrue_yield reverts -- so the protocol runs at zero (honest)
// yield until a real adapter is plugged in.
#[test(should_fail_with = "no yield source configured")]
unconstrained fn test_accrue_yield_without_source_reverts() {
    let (env, addr, admin) = setup();
    env.call_public(admin, DeFiVault::at(addr).accrue_yield(100));
}

// Even after a source is set, the admin (anyone but the source) cannot report
// yield -- only the configured adapter can.
#[test(should_fail_with = "only the yield source can report yield")]
unconstrained fn test_admin_cannot_fabricate_yield_after_source_set() {
    let (mut env, addr, admin) = setup();
    let source = env.create_light_account();
    env.call_public(admin, DeFiVault::at(addr).set_yield_source(source));
    env.call_public(admin, DeFiVault::at(addr).accrue_yield(100));
}

// A configured yield source CAN report realized yield, and it lands in the
// vault balance.
#[test]
unconstrained fn test_configured_source_reports_real_yield() {
    let (mut env, addr, admin) = setup();
    let source = env.create_light_account();
    env.call_public(admin, DeFiVault::at(addr).set_yield_source(source));
    env.call_public(source, DeFiVault::at(addr).accrue_yield(420));

    let accrued = env.execute_utility(DeFiVault::at(addr).get_accrued_yield());
    assert_eq(accrued, 420);
    // total_deposited is still 0, so balance == accrued yield.
    let balance = env.execute_utility(DeFiVault::at(addr).get_balance());
    assert_eq(balance, 420);
    let stored_source = env.execute_utility(DeFiVault::at(addr).get_yield_source());
    assert_eq(stored_source, source);
}

#[test(should_fail_with = "not admin")]
unconstrained fn test_set_yield_source_requires_admin() {
    let (mut env, addr, _admin) = setup();
    let stranger = env.create_light_account();
    env.call_public(stranger, DeFiVault::at(addr).set_yield_source(stranger));
}
