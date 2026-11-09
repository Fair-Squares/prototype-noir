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

#[test]
unconstrained fn test_min_quorum_votes_set() {
    let (env, addr, _admin) = setup();
    assert_eq(env.execute_utility(Governance::at(addr).get_min_quorum_votes()), 2);
}

#[test]
unconstrained fn test_two_proposals_increment_ids() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(1), 100));
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(2), 200));
    assert_eq(env.execute_utility(Governance::at(gov).get_proposal_count()), 2);
    // The two proposals are distinct rows keyed by their sequential id.
    assert_eq(env.execute_utility(Governance::at(gov).get_proposal(0)).amount, 100);
    assert_eq(env.execute_utility(Governance::at(gov).get_proposal(1)).amount, 200);
}

#[test]
unconstrained fn test_public_proposal_views_match() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(9), 750));
    // The public (#[view]) accessors agree with the utility ProposalView.
    assert_eq(env.view_public(Governance::at(gov).get_proposal_status_public(0)), 0); // ACTIVE
    assert_eq(env.view_public(Governance::at(gov).get_proposal_amount_public(0)), 750);
}

// -- finalize / execute guards ------------------------------------------------
// The yes/no tally only moves via the private cast_vote_private path (hinted KYC
// + deposit notes), so the PASSED/FAILED outcomes remain a deferred private
// E2E. These cover the public-path guards that gate finalize and execute.

#[test(should_fail_with = "voting window still open")]
unconstrained fn test_finalize_before_deadline_fails() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // The 300-block voting window has not elapsed (only a handful of blocks have
    // been mined), so finalize must reject.
    env.call_public(proposer, Governance::at(gov).finalize_proposal(0));
}

#[test(should_fail_with = "not admin")]
unconstrained fn test_execute_proposal_requires_admin() {
    let (mut env, gov, _admin, _proposer) = setup_with_investor();
    let stranger = env.create_light_account();
    env.call_public(stranger, Governance::at(gov).execute_proposal(0));
}

#[test(should_fail_with = "proposal must be in PASSED state")]
unconstrained fn test_execute_proposal_rejects_non_passed() {
    let (mut env, gov, admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // Proposal 0 is ACTIVE, not PASSED, so the admin cannot execute it yet.
    env.call_public(admin, Governance::at(gov).execute_proposal(0));
}

// -- W1: affordability covenant (a votable proposal term) ---------------------

#[test]
unconstrained fn test_proposal_without_covenant_reports_unset() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // A fresh proposal has no covenant: every field reads zero and is_set is false.
    let cov = env.execute_utility(Governance::at(gov).get_proposal_covenant(0));
    assert(!cov.is_set);
    assert_eq(cov.rent_ceiling_bps, 0);
    assert_eq(cov.lock_years, 0);
}

#[test]
unconstrained fn test_set_proposal_covenant_by_proposer() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // The proposer attaches a 3.5%/yr ceiling and a 20-year lock.
    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)),
    );
    let cov = env.execute_utility(Governance::at(gov).get_proposal_covenant(0));
    assert(cov.is_set);
    assert_eq(cov.rent_ceiling_bps, 350);
    assert_eq(cov.lock_years, 20);
}

#[test(should_fail_with = "only the proposer can attach a covenant")]
unconstrained fn test_set_proposal_covenant_rejects_non_proposer() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    let stranger = env.create_light_account();
    env.call_public(
        stranger,
        Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)),
    );
}

#[test(should_fail_with = "covenant already set")]
unconstrained fn test_set_proposal_covenant_rejects_double_set() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)),
    );
    // A second attach must fail -- the covenant is fixed once set.
    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 400, 25, Field::from(0)),
    );
}

#[test(should_fail_with = "rent ceiling out of range")]
unconstrained fn test_set_proposal_covenant_rejects_excess_ceiling() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // A ceiling above 100%/yr (10000 bps) is rejected.
    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 20000, 20, Field::from(0)),
    );
}

#[test]
unconstrained fn test_public_covenant_getters_match() {
    let (mut env, gov, _admin, proposer) = setup_with_investor();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(42), 1000));
    // Before a covenant is attached, the public accessors HousingFund reads report
    // "no covenant" so the fund enforces nothing.
    assert_eq(env.view_public(Governance::at(gov).get_proposal_covenant_set_public(0)), false);

    env.call_public(
        proposer,
        Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)),
    );
    // After attaching, the cross-contract (#[view]) primitives match what was set.
    assert_eq(env.view_public(Governance::at(gov).get_proposal_covenant_set_public(0)), true);
    assert_eq(env.view_public(Governance::at(gov).get_proposal_rent_ceiling_bps_public(0)), 350);
    assert_eq(env.view_public(Governance::at(gov).get_proposal_lock_years_public(0)), 20);
}

// -- J1/J2: listing + council review lifecycle --------------------------------
// Extends setup_with_investor with a property owner and a council member so the
// full journey middle (submit -> council review -> proposal) runs on the PUBLIC
// path against a real KYCVerifier.
unconstrained fn setup_with_listing_roles() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let proposer = env.create_light_account();
    let owner = env.create_light_account();
    let councillor = env.create_light_account();
    let kyc = env.deploy("KYCVerifier").with_public_initializer(
        admin,
        KYCVerifier::interface().constructor(admin),
    );
    let gov = env.deploy("Governance").with_public_initializer(
        admin,
        Governance::interface().constructor(admin, kyc, admin, 300, 2),
    );
    // admin is the constructor-seeded verifier: it vets the investor and the
    // property owner; council membership is an admin grant.
    env.call_public(admin, KYCVerifier::at(kyc).register_kyc(proposer));
    env.call_public(admin, KYCVerifier::at(kyc).register_property_owner(owner));
    env.call_public(admin, KYCVerifier::at(kyc).set_council_role(councillor, true));
    (env, gov, admin, proposer, owner, councillor)
}

#[test]
unconstrained fn test_submit_listing_starts_submitted() {
    let (mut env, gov, _admin, _proposer, owner, _councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    assert_eq(env.execute_utility(Governance::at(gov).get_listing_count()), 1);
    let listing = env.execute_utility(Governance::at(gov).get_listing(0));
    assert_eq(listing.ask_eur, 250000);
    assert_eq(listing.market_rent_ref_eur, 1200);
    assert_eq(listing.dossier_hash, Field::from(77));
    assert_eq(listing.status, 1); // LISTING_SUBMITTED
    assert_eq(listing.approvals, 0);
    assert_eq(listing.quality_score, 0);
}

#[test(should_fail_with = "property owner role required")]
unconstrained fn test_submit_listing_rejects_non_owner() {
    let (mut env, gov, _admin, proposer, _owner, _councillor) = setup_with_listing_roles();
    // proposer is an investor but not a registered property owner.
    env.call_public(proposer, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
}

#[test(should_fail_with = "dossier hash required")]
unconstrained fn test_submit_listing_rejects_empty_dossier() {
    let (mut env, gov, _admin, _proposer, owner, _councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(0)));
}

#[test]
unconstrained fn test_council_approve_flips_status_and_scores() {
    let (mut env, gov, _admin, _proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    // min_council_approvals defaults to 1, so one approval crosses the threshold.
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    let listing = env.execute_utility(Governance::at(gov).get_listing(0));
    assert_eq(listing.status, 2); // LISTING_COUNCIL_APPROVED
    assert_eq(listing.approvals, 1);
    assert_eq(listing.quality_score, 82);
}

#[test(should_fail_with = "council role required")]
unconstrained fn test_council_approve_rejects_non_council() {
    let (mut env, gov, _admin, proposer, owner, _councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(proposer, Governance::at(gov).council_approve(0, 82));
}

#[test(should_fail_with = "score above 100")]
unconstrained fn test_council_approve_rejects_oversized_score() {
    let (mut env, gov, _admin, _proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 101));
}

#[test(should_fail_with = "unknown listing")]
unconstrained fn test_council_approve_rejects_unknown_listing() {
    let (mut env, gov, _admin, _proposer, _owner, councillor) = setup_with_listing_roles();
    // No listing was submitted; id 0 must not read as reviewable (nonzero-status lesson).
    env.call_public(councillor, Governance::at(gov).council_approve(0, 50));
}

#[test(should_fail_with = "listing not under review")]
unconstrained fn test_council_approve_rejects_already_approved_listing() {
    let (mut env, gov, _admin, _proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    // Threshold already crossed -> status is COUNCIL_APPROVED, not SUBMITTED.
    env.call_public(councillor, Governance::at(gov).council_approve(0, 90));
}

#[test]
unconstrained fn test_council_reject_is_final() {
    let (mut env, gov, _admin, _proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_reject(0));
    let listing = env.execute_utility(Governance::at(gov).get_listing(0));
    assert_eq(listing.status, 4); // LISTING_REJECTED
}

#[test]
unconstrained fn test_create_proposal_from_listing_inherits_ask() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));

    let view = env.execute_utility(Governance::at(gov).get_proposal(0));
    assert_eq(view.amount, 250000); // inherited from the listing, not caller-supplied
    assert_eq(view.status, 0); // ACTIVE
    let listing = env.execute_utility(Governance::at(gov).get_listing(0));
    assert_eq(listing.status, 3); // LISTING_PROPOSED
    // Back-reference: listing_id + 1 (0 = legacy direct proposal).
    assert_eq(env.execute_utility(Governance::at(gov).get_proposal_listing_id_plus_one(0)), 1);
}

#[test(should_fail_with = "listing not council-approved")]
unconstrained fn test_create_proposal_from_unapproved_listing_fails() {
    let (mut env, gov, _admin, proposer, owner, _councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
}

#[test(should_fail_with = "listing not council-approved")]
unconstrained fn test_listing_backs_at_most_one_proposal() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
    // Listing is now PROPOSED; a second proposal from it must fail.
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(43)));
}

// -- J3: affordability baseline (listing-backed covenants) ---------------------
// ask 250000 EUR, market rent 1200 EUR/mo -> baseline cap = 1200 * 80% = 960/mo.
// ceiling 350 bps/yr -> 250000*350/10000/12 = 729/mo (within baseline).
// ceiling 500 bps/yr -> 250000*500/10000/12 = 1041/mo (above the cap).

#[test]
unconstrained fn test_covenant_within_baseline_accepted() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
    env.call_public(proposer, Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)));
    assert_eq(env.view_public(Governance::at(gov).get_proposal_covenant_set_public(0)), true);
}

#[test(should_fail_with = "covenant above affordability baseline")]
unconstrained fn test_covenant_above_baseline_rejected() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
    // 500 bps/yr on a 250k ask is ~1041 EUR/mo -- above the 960 baseline cap.
    env.call_public(proposer, Governance::at(gov).set_proposal_covenant(0, 500, 20, Field::from(0)));
}

// -- J4: funding queue + priority ----------------------------------------------

#[test]
unconstrained fn test_funding_queue_starts_empty() {
    let (env, gov, _admin, _proposer, _owner, _councillor) = setup_with_listing_roles();
    assert_eq(env.view_public(Governance::at(gov).get_funding_queue_head_public()), 0);
    assert_eq(env.view_public(Governance::at(gov).get_funding_queue_tail_public()), 0);
}

#[test(should_fail_with = "queue index out of range")]
unconstrained fn test_funding_queue_entry_out_of_range() {
    let (mut env, gov, _admin, _proposer, _owner, _councillor) = setup_with_listing_roles();
    let _ = env.view_public(Governance::at(gov).get_funding_queue_entry_public(0));
}

#[test]
unconstrained fn test_proposal_priority_packs_score_and_discount() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    // ask 250000, market 1200/mo, score 82, ceiling 350 bps/yr:
    // ceiling_monthly = 729, baseline cap = 960 -> discount 231.
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
    // Before the covenant: score only, zero discount.
    assert_eq(env.view_public(Governance::at(gov).get_proposal_priority_public(0)), 82_000_000_000);
    env.call_public(proposer, Governance::at(gov).set_proposal_covenant(0, 350, 20, Field::from(0)));
    assert_eq(env.view_public(Governance::at(gov).get_proposal_priority_public(0)), 82_000_000_231);
}

#[test(should_fail_with = "proposal has no listing")]
unconstrained fn test_priority_rejects_legacy_proposal() {
    let (mut env, gov, _admin, proposer, _owner, _councillor) = setup_with_listing_roles();
    env.call_public(proposer, Governance::at(gov).create_proposal(Field::from(9), 750));
    let _ = env.view_public(Governance::at(gov).get_proposal_priority_public(0));
}

#[test(should_fail_with = "only the housing fund can match")]
unconstrained fn test_mark_matched_rejects_non_fund() {
    let (mut env, gov, _admin, proposer, owner, councillor) = setup_with_listing_roles();
    env.call_public(owner, Governance::at(gov).submit_listing(250000, 1200, Field::from(77)));
    env.call_public(councillor, Governance::at(gov).council_approve(0, 82));
    env.call_public(proposer, Governance::at(gov).create_proposal_from_listing(0, Field::from(42)));
    // proposer is not the wired housing fund.
    env.call_public(proposer, Governance::at(gov).mark_matched(0, 0));
}
