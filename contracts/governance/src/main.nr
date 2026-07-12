mod test;

use aztec::macros::aztec;

/// Governance -- voting on property acquisitions for Fair Squares.
///
/// Prototype: public voting (simple, compiles reliably).
/// Future: private voting with nullifier-based double-vote prevention.
///
/// Flow:
///   1. Council or admin creates proposals -- public
///   2. Any verified user calls cast_vote(proposal_id, vote_yes) -- public
///   3. After deadline, anyone calls finalize_proposal() -- public
#[aztec]
pub contract Governance {
    use deposit_note::{DepositNote, withdraw_marker_nullifier};
    use kyc_verifier::{KYCVerifier, credential_note::KycCredentialNote};
    use aztec::{
        history::{note::assert_note_existed_by, nullifier::assert_nullifier_did_not_exist_by},
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        note::{HintedNote, utils::compute_confirmed_note_hash_for_nullification},
        protocol::{
            address::AztecAddress,
            hash::{compute_siloed_nullifier, poseidon2_hash},
            traits::{Deserialize, Serialize, ToField},
        },
        state_vars::{Map, Owned, PublicMutable, SingleUseClaim},
    };

    // Proposal status constants
    global STATUS_ACTIVE: u8 = 0;
    global STATUS_PASSED: u8 = 1;
    global STATUS_FAILED: u8 = 2;
    global STATUS_EXECUTED: u8 = 3;

    // J1/J2 listing status constants. Deliberately NONZERO: unwritten public
    // storage reads 0, so 0 must never be a valid listing status (a lesson from
    // STATUS_ACTIVE == 0 above, where every nonexistent proposal reads ACTIVE).
    global LISTING_SUBMITTED: u8 = 1;
    global LISTING_COUNCIL_APPROVED: u8 = 2;
    global LISTING_PROPOSED: u8 = 3;
    global LISTING_REJECTED: u8 = 4;
    // Council quality scores are 0..=100 (price-quality judgment, J4 ranking input).
    global MAX_QUALITY_SCORE: u32 = 100;

    #[derive(Serialize, Deserialize)]
    pub struct ProposalView {
        pub desc_hash: Field,
        pub amount: u64,
        pub yes_votes: u32,
        pub no_votes: u32,
        pub status: u8,
        pub created_block: u32,
        pub deadline_block: u32,
    }

    /// Affordability covenant attached to a proposal (W1). These are the terms
    /// members vote on alongside the capital ask -- the on-chain counterpart of
    /// the previously frontend-only `projectDossier` covenant. All-zero with
    /// `is_set == false` means no covenant was attached to this proposal.
    #[derive(Serialize, Deserialize)]
    pub struct CovenantView {
        /// Maximum ANNUAL rent, in bps of the property's acquisition value
        /// (same unit as `ror_bps` in HousingFund). The keeper-posted rent is
        /// capped against this at `record_rent` once 1c lands.
        pub rent_ceiling_bps: u32,
        /// Affordability lock length, in years. The ceiling lifts at maturity.
        pub lock_years: u32,
        /// Hashed eligibility group for covenant-gated access (0 = open).
        pub target_group: Field,
        /// True once the proposer has attached the covenant (once-only).
        pub is_set: bool,
    }

    /// J1/J2: a property listing under (or past) council review. `quality_score`
    /// is the floor average of council scores (0 until the first approval);
    /// J4's funding queue ranks by it.
    #[derive(Serialize, Deserialize)]
    pub struct ListingView {
        pub proposer: AztecAddress,
        pub ask_eur: u64,
        pub market_rent_ref_eur: u64,
        pub dossier_hash: Field,
        pub status: u8,
        pub approvals: u32,
        pub quality_score: u32,
    }

    #[storage]
    struct Storage<Context> {
        // Linked contract addresses
        housing_fund: PublicMutable<AztecAddress, Context>,
        kyc_verifier: PublicMutable<AztecAddress, Context>,
        fund_token: PublicMutable<AztecAddress, Context>,
        voting_window_blocks: PublicMutable<u32, Context>,
        min_quorum_votes: PublicMutable<u32, Context>,

        // Proposal counter
        proposal_count: PublicMutable<u32, Context>,

        // Per-proposal storage (indexed by proposal_id as Field)
        p_desc_hash: Map<Field, PublicMutable<Field, Context>, Context>,
        p_amount: Map<Field, PublicMutable<u64, Context>, Context>,
        p_yes_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        p_no_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        p_status: Map<Field, PublicMutable<u8, Context>, Context>,
        p_proposer: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        p_created_block: Map<Field, PublicMutable<u32, Context>, Context>,
        p_deadline_block: Map<Field, PublicMutable<u32, Context>, Context>,

        // V2: nullifier per (proposal_id, voter) for secret-ballot private voting.
        vote_claims: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,

        // Admin (the deployer) -- gates execute_proposal so only an authorized
        // caller can flip a PASSED proposal to EXECUTED. Appended at the END of
        // the struct so existing storage slots are not shifted.
        admin: PublicMutable<AztecAddress, Context>,

        // W1: per-proposal affordability covenant. Appended at the END so existing
        // storage slots are not shifted. An unwritten slot reads zero / false, so a
        // proposal with no covenant reports is_set == false.
        p_rent_ceiling_bps: Map<Field, PublicMutable<u32, Context>, Context>,
        p_lock_years: Map<Field, PublicMutable<u32, Context>, Context>,
        p_target_group: Map<Field, PublicMutable<Field, Context>, Context>,
        p_covenant_set: Map<Field, PublicMutable<bool, Context>, Context>,

        // J1/J2: property listings -- the pre-proposal onboarding + council
        // stage (journey steps 2 and 3a). Appended at the END so existing
        // slots keep their positions. Keyed by listing_id as Field.
        listing_count: PublicMutable<u32, Context>,
        min_council_approvals: PublicMutable<u32, Context>,
        l_proposer: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        l_ask_eur: Map<Field, PublicMutable<u64, Context>, Context>,
        // Appraiser-attested MONTHLY market rent (EUR). Part of the dossier;
        // J3 anchors the affordability-covenant baseline check to it.
        l_market_rent_ref_eur: Map<Field, PublicMutable<u64, Context>, Context>,
        // Poseidon2 hash of the off-chain document bundle (appraiser report +
        // technical assessment). The chain stores commitment, not content.
        l_dossier_hash: Map<Field, PublicMutable<Field, Context>, Context>,
        l_status: Map<Field, PublicMutable<u8, Context>, Context>,
        // Council review accumulators: floor-average score = score_sum / approvals.
        l_score_sum: Map<Field, PublicMutable<u64, Context>, Context>,
        l_approvals: Map<Field, PublicMutable<u32, Context>, Context>,
        // Double-approve guard: poseidon2([listing_id, councillor]) -> approved?
        l_council_approved: Map<Field, PublicMutable<bool, Context>, Context>,
        // Proposal -> listing back-reference, stored as listing_id + 1 so an
        // unwritten slot (0) means "no listing" (legacy direct proposals).
        p_listing_id_plus_one: Map<Field, PublicMutable<u32, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        housing_fund: AztecAddress,
        kyc_verifier: AztecAddress,
        fund_token: AztecAddress,
        voting_window_blocks: u32,
        min_quorum_votes: u32,
    ) {
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        assert(!kyc_verifier.is_zero(), "invalid kyc_verifier");
        assert(!fund_token.is_zero(), "invalid fund_token");
        assert(voting_window_blocks > 0, "invalid voting window");
        assert(min_quorum_votes > 0, "invalid quorum");
        self.storage.housing_fund.write(housing_fund);
        self.storage.kyc_verifier.write(kyc_verifier);
        self.storage.fund_token.write(fund_token);
        self.storage.voting_window_blocks.write(voting_window_blocks);
        self.storage.min_quorum_votes.write(min_quorum_votes);
        self.storage.proposal_count.write(0);
        // The deployer is the admin authorized to execute passed proposals.
        self.storage.admin.write(self.msg_sender());
        // J2: one council approval suffices by default (demo posture); raise
        // via set_min_council_approvals. Initialized here (not a constructor
        // arg) so the deploy/bootstrap surface doesn't change.
        self.storage.listing_count.write(0);
        self.storage.min_council_approvals.write(1);
    }

    /// J2: admin raises/lowers the council approval threshold (>= 1).
    #[external("public")]
    fn set_min_council_approvals(min_approvals: u32) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(min_approvals > 0, "invalid approval threshold");
        self.storage.min_council_approvals.write(min_approvals);
    }

    // -- Create a new proposal --------------------------------------------
    //
    // PRIVACY NOTE (L8): `create_proposal` runs entirely in public, so it
    // records the proposer's address (`p_proposer`) and, via the public
    // `is_investor(caller)` check below, publicly confirms the proposer's KYC
    // status. Unlike `cast_vote_private`, proposer identity here is treated as
    // INTENTIONALLY PUBLIC: proposals are accountable governance actions whose
    // author is meant to be attributable. A future privacy-preserving variant
    // could mirror `cast_vote_private` (attest a hinted KYC credential and keep
    // the proposer address off the public boundary); see also M15 below.
    //
    // PRIVACY NOTE (M15): the `is_investor(caller)` call reads KYCVerifier's
    // legacy PUBLIC `investor_role` map on a public path, so every public
    // proposal creation publicly confirms the caller is KYC-verified and leaks
    // them into the participant set. This legacy public check should be scoped
    // to transparency-mode callers; the privacy-preserving everyday flow is the
    // private KYC-credential attestation used by `cast_vote_private`.

    #[external("public")]
    fn create_proposal(description_hash: Field, amount: u64) -> pub u32 {
        let caller = self.msg_sender();
        assert(!caller.is_zero(), "invalid caller");
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "investor role required");

        let proposal_id = self.storage.proposal_count.read();
        let pid = proposal_id as Field;
        let created_block = self.context.block_number();
        let deadline_block = created_block + self.storage.voting_window_blocks.read();

        self.storage.p_desc_hash.at(pid).write(description_hash);
        self.storage.p_amount.at(pid).write(amount);
        self.storage.p_yes_votes.at(pid).write(0);
        self.storage.p_no_votes.at(pid).write(0);
        self.storage.p_status.at(pid).write(STATUS_ACTIVE);
        self.storage.p_proposer.at(pid).write(caller);
        self.storage.p_created_block.at(pid).write(created_block);
        self.storage.p_deadline_block.at(pid).write(deadline_block);

        self.storage.proposal_count.write(proposal_id + 1);
        proposal_id
    }

    // -- J1/J2: property listings (journey steps 2 + 3a) ----------------------
    //
    // A property owner submits a listing (capital ask + appraiser-attested
    // market rent + dossier hash); the Housing Council reviews it; only a
    // COUNCIL_APPROVED listing can become a proposal via
    // create_proposal_from_listing. The direct create_proposal above stays
    // this phase for demo/back-compat -- the journey UI routes through
    // listings; a later phase retires the ungated path.

    /// J1: submit a property listing. Public by design (like create_proposal,
    /// L8 applies: submitters are accountable, and the dossier is a public
    /// document -- only its content stays off-chain behind the hash).
    #[external("public")]
    fn submit_listing(
        ask_eur: u64,
        market_rent_ref_eur: u64,
        dossier_hash: Field,
    ) -> pub u32 {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        assert(
            self.view(kyc_contract.is_property_owner(caller)),
            "property owner role required",
        );
        assert(ask_eur > 0, "ask must be positive");
        assert(market_rent_ref_eur > 0, "market rent reference required");
        assert(dossier_hash != 0, "dossier hash required");

        let listing_id = self.storage.listing_count.read();
        let lid = listing_id as Field;
        self.storage.l_proposer.at(lid).write(caller);
        self.storage.l_ask_eur.at(lid).write(ask_eur);
        self.storage.l_market_rent_ref_eur.at(lid).write(market_rent_ref_eur);
        self.storage.l_dossier_hash.at(lid).write(dossier_hash);
        self.storage.l_status.at(lid).write(LISTING_SUBMITTED);
        self.storage.listing_count.write(listing_id + 1);
        listing_id
    }

    /// J2: a council member approves a listing with a 0..=100 quality score
    /// (price-quality judgment; J4 ranks the funding queue by the average).
    /// The listing flips to COUNCIL_APPROVED once min_council_approvals
    /// distinct members have approved.
    #[external("public")]
    fn council_approve(listing_id: u32, quality_score: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        assert(self.view(kyc_contract.is_council(caller)), "council role required");
        assert(listing_id < self.storage.listing_count.read(), "unknown listing");
        assert(quality_score <= MAX_QUALITY_SCORE, "score above 100");

        let lid = listing_id as Field;
        assert_eq(
            self.storage.l_status.at(lid).read(),
            LISTING_SUBMITTED,
            "listing not under review",
        );

        // One approval per (listing, councillor).
        let guard_key = poseidon2_hash([lid, caller.to_field()]);
        assert(
            !self.storage.l_council_approved.at(guard_key).read(),
            "councillor already approved",
        );
        self.storage.l_council_approved.at(guard_key).write(true);

        let approvals = self.storage.l_approvals.at(lid).read() + 1;
        self.storage.l_approvals.at(lid).write(approvals);
        self.storage.l_score_sum.at(lid).write(
            self.storage.l_score_sum.at(lid).read() + quality_score as u64,
        );

        if approvals >= self.storage.min_council_approvals.read() {
            self.storage.l_status.at(lid).write(LISTING_COUNCIL_APPROVED);
        }
    }

    /// J2: a single council rejection is final (fail-closed; the owner can
    /// resubmit an amended dossier as a new listing).
    #[external("public")]
    fn council_reject(listing_id: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        assert(self.view(kyc_contract.is_council(caller)), "council role required");
        assert(listing_id < self.storage.listing_count.read(), "unknown listing");

        let lid = listing_id as Field;
        assert_eq(
            self.storage.l_status.at(lid).read(),
            LISTING_SUBMITTED,
            "listing not under review",
        );
        self.storage.l_status.at(lid).write(LISTING_REJECTED);
    }

    /// J1: open the investor vote on a council-approved listing. The capital
    /// ask is inherited from the listing so proposal and dossier can't drift;
    /// the listing flips to PROPOSED so it can back at most one proposal.
    #[external("public")]
    fn create_proposal_from_listing(
        listing_id: u32,
        description_hash: Field,
    ) -> pub u32 {
        let caller = self.msg_sender();
        assert(!caller.is_zero(), "invalid caller");
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        assert(self.view(kyc_contract.is_investor(caller)), "investor role required");
        assert(listing_id < self.storage.listing_count.read(), "unknown listing");

        let lid = listing_id as Field;
        assert_eq(
            self.storage.l_status.at(lid).read(),
            LISTING_COUNCIL_APPROVED,
            "listing not council-approved",
        );

        let amount = self.storage.l_ask_eur.at(lid).read();
        let proposal_id = self.storage.proposal_count.read();
        let pid = proposal_id as Field;
        let created_block = self.context.block_number();
        let deadline_block = created_block + self.storage.voting_window_blocks.read();

        self.storage.p_desc_hash.at(pid).write(description_hash);
        self.storage.p_amount.at(pid).write(amount);
        self.storage.p_yes_votes.at(pid).write(0);
        self.storage.p_no_votes.at(pid).write(0);
        self.storage.p_status.at(pid).write(STATUS_ACTIVE);
        self.storage.p_proposer.at(pid).write(caller);
        self.storage.p_created_block.at(pid).write(created_block);
        self.storage.p_deadline_block.at(pid).write(deadline_block);
        self.storage.p_listing_id_plus_one.at(pid).write(listing_id + 1);

        self.storage.proposal_count.write(proposal_id + 1);
        self.storage.l_status.at(lid).write(LISTING_PROPOSED);
        proposal_id
    }

    // -- V2: private cast_vote (secret ballot via SingleUseClaim nullifier) ----
    //
    // The caller passes a hinted KycCredentialNote that proves they hold a
    // valid KYC credential issued by KYCVerifier. We verify ownership privately,
    // then claim a single-use nullifier scoped to (proposal_id, msg_sender) so
    // each voter can vote at most once per proposal. Only the aggregate tally
    // (yes/no counters) is updated publicly; the voter's address and choice
    // are unlinkable from on-chain state.

    #[external("private")]
    fn cast_vote_private(
        proposal_id: u32,
        vote_yes: bool,
        hinted_kyc_note: HintedNote<KycCredentialNote>,
        hinted_deposit_note: HintedNote<DepositNote>,
    ) {
        let header = self.context.get_anchor_block_header();
        let confirmed_kyc = assert_note_existed_by(header, hinted_kyc_note);

        let caller = self.msg_sender();
        assert(confirmed_kyc.owner == caller, "kyc note not owned by caller");
        assert(confirmed_kyc.note.owner == caller, "kyc note owner mismatch");

        // Prove the caller has fund exposure. Any DepositNote owned by the
        // caller suffices; amount is not revealed.
        let confirmed_dep = assert_note_existed_by(header, hinted_deposit_note);
        assert(confirmed_dep.owner == caller, "deposit note not owned by caller");
        assert(confirmed_dep.note.owner == caller, "deposit note owner mismatch");

        // H1 mirror: existence alone is HISTORICAL -- a fully-withdrawn note
        // still "existed by" the anchor block, so without this check a user who
        // pulled out their entire deposit could keep voting forever. Recompute
        // the fund's withdraw marker for this exact kernel-verified note and
        // prove it was absent at the anchor block (siloed to the note's origin
        // contract, which the public tail pins to the real HousingFund).
        let dep_note_hash = compute_confirmed_note_hash_for_nullification(confirmed_dep);
        assert_nullifier_did_not_exist_by(
            header,
            compute_siloed_nullifier(
                confirmed_dep.contract_address,
                withdraw_marker_nullifier(dep_note_hash),
            ),
        );

        // Consume the per-(proposal, voter) single-use nullifier.
        let pid = proposal_id as Field;
        self.storage.vote_claims.at(pid).at(caller).claim();

        // Compute the credential's revocation commitment for the public tail.
        //
        // PRIVACY NOTE (M12 -- known linkage): this commitment is the constant
        // handle `poseidon2([owner, nonce])`, the same value HousingFund's
        // deposit_private tail publishes. An on-chain observer can therefore
        // cluster a user's deposits and votes by matching this field. See the
        // matching note in housing_fund deposit_private for the remediation
        // options (private revocation via DelayedPublicMutable, or a per-action
        // salt with per-domain revocation registration).
        let credential_commitment = poseidon2_hash([
            confirmed_kyc.note.owner.to_field(),
            confirmed_kyc.note.nonce,
        ]);

        // Tally publicly. Args are proposal_id, vote choice, both hinted
        // notes' contract addresses (KYC and deposit origin checks), and
        // the revocation commitment. The voter's address never crosses
        // the private/public boundary.
        self.enqueue_self._tally_vote_private(
            proposal_id,
            vote_yes,
            confirmed_kyc.contract_address,
            confirmed_dep.contract_address,
            credential_commitment,
        );
    }

    #[external("public")]
    #[only_self]
    fn _tally_vote_private(
        proposal_id: u32,
        vote_yes: bool,
        kyc_note_contract: AztecAddress,
        deposit_note_contract: AztecAddress,
        credential_commitment: Field,
    ) {
        let kyc_addr = self.storage.kyc_verifier.read();
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        let housing_fund_addr = self.storage.housing_fund.read();
        assert(deposit_note_contract == housing_fund_addr, "deposit note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        let pid = proposal_id as Field;
        assert(
            self.storage.p_status.at(pid).read() == STATUS_ACTIVE,
            "proposal is not active",
        );
        // A proposal stays ACTIVE until someone manually finalizes it, so the
        // STATUS_ACTIVE gate alone would let a voter wait for the observable
        // yes/no split and then cast a decisive vote after the window closed.
        // Reject any tally past the deadline (finalize requires block >= deadline,
        // so the voting window is exactly [created, deadline)).
        assert(
            self.context.block_number() < self.storage.p_deadline_block.at(pid).read(),
            "voting window closed",
        );

        if vote_yes {
            let current = self.storage.p_yes_votes.at(pid).read();
            self.storage.p_yes_votes.at(pid).write(current + 1);
        } else {
            let current = self.storage.p_no_votes.at(pid).read();
            self.storage.p_no_votes.at(pid).write(current + 1);
        }
    }

    // -- Finalize a proposal ----------------------------------------------

    #[external("public")]
    fn finalize_proposal(proposal_id: u32) {
        let pid = proposal_id as Field;
        assert(
            self.storage.p_status.at(pid).read() == STATUS_ACTIVE,
            "proposal is not active",
        );

        let current_block = self.context.block_number();
        let deadline_block = self.storage.p_deadline_block.at(pid).read();
        assert(current_block >= deadline_block, "voting window still open");

        let yes_votes = self.storage.p_yes_votes.at(pid).read();
        let no_votes = self.storage.p_no_votes.at(pid).read();
        let quorum = self.storage.min_quorum_votes.read();

        assert(yes_votes + no_votes >= quorum, "quorum not reached");

        // Strict-majority rule: a proposal PASSES only with strictly more YES
        // than NO votes. A tie (yes == no) falls into the `else` branch and
        // resolves to FAILED -- the proposer must clear, not merely meet, the
        // opposition. (L33)
        if yes_votes > no_votes {
            self.storage.p_status.at(pid).write(STATUS_PASSED);
        } else {
            self.storage.p_status.at(pid).write(STATUS_FAILED);
        }
    }

    // -- Execute a passed proposal (marks as EXECUTED, triggers FSFT mint) ----
    // FSFT distribution is opened separately in HousingFund via open_distribution().

    #[external("public")]
    fn execute_proposal(proposal_id: u32) {
        // Only the admin may execute. finalize_proposal is a permissionless
        // crank (it resolves the on-chain tally deterministically), but
        // execution is an authorized action: it triggers the downstream FSFT
        // mint / distribution, so an unauthenticated PASSED->EXECUTED flip must
        // be impossible.
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");

        let pid = proposal_id as Field;

        let status = self.storage.p_status.at(pid).read();
        assert(status == STATUS_PASSED, "proposal must be in PASSED state");

        self.storage.p_status.at(pid).write(STATUS_EXECUTED);
    }

    // -- W1: attach the affordability covenant (a votable proposal term) ------
    //
    // The proposer attaches the covenant to their fresh proposal ONCE, while it
    // is still ACTIVE and BEFORE any vote is cast. That makes the covenant a
    // fixed term every voter sees -- it cannot be changed mid-ballot -- without
    // changing `create_proposal`'s signature (so existing callers keep working).
    // Enforcement of the ceiling lands in HousingFund.record_rent (the fund pulls
    // the covenant via sync_proposal_covenant). Affordability is enforced by
    // REJECTING rent above the ceiling -- there is no clawback/recapture path.

    #[external("public")]
    fn set_proposal_covenant(
        proposal_id: u32,
        rent_ceiling_bps: u32,
        lock_years: u32,
        target_group: Field,
    ) {
        let pid = proposal_id as Field;
        assert_eq(
            self.msg_sender(),
            self.storage.p_proposer.at(pid).read(),
            "only the proposer can attach a covenant",
        );
        assert(self.storage.p_status.at(pid).read() == STATUS_ACTIVE, "proposal is not active");
        assert(!self.storage.p_covenant_set.at(pid).read(), "covenant already set");
        let cast = self.storage.p_yes_votes.at(pid).read() + self.storage.p_no_votes.at(pid).read();
        assert(cast == 0, "covenant must be set before voting begins");

        // Sane bounds: a positive ceiling no greater than 100%/yr and a finite lock.
        assert(rent_ceiling_bps > 0, "rent ceiling must be positive");
        assert(rent_ceiling_bps <= 10000, "rent ceiling out of range");
        assert(lock_years > 0, "lock years must be positive");
        assert(lock_years <= 100, "lock years out of range");

        self.storage.p_rent_ceiling_bps.at(pid).write(rent_ceiling_bps);
        self.storage.p_lock_years.at(pid).write(lock_years);
        self.storage.p_target_group.at(pid).write(target_group);
        self.storage.p_covenant_set.at(pid).write(true);
    }

    // -- View functions ---------------------------------------------------

    #[external("utility")]
    unconstrained fn get_proposal_count() -> pub u32 {
        self.storage.proposal_count.read()
    }

    #[external("utility")]
    unconstrained fn get_proposal(proposal_id: u32) -> pub ProposalView {
        let pid = proposal_id as Field;
        ProposalView {
            desc_hash: self.storage.p_desc_hash.at(pid).read(),
            amount: self.storage.p_amount.at(pid).read(),
            yes_votes: self.storage.p_yes_votes.at(pid).read(),
            no_votes: self.storage.p_no_votes.at(pid).read(),
            status: self.storage.p_status.at(pid).read(),
            created_block: self.storage.p_created_block.at(pid).read(),
            deadline_block: self.storage.p_deadline_block.at(pid).read(),
        }
    }

    #[external("utility")]
    unconstrained fn get_proposal_status(proposal_id: u32) -> pub u8 {
        let pid = proposal_id as Field;
        self.storage.p_status.at(pid).read()
    }

    #[external("utility")]
    unconstrained fn get_proposal_covenant(proposal_id: u32) -> pub CovenantView {
        let pid = proposal_id as Field;
        CovenantView {
            rent_ceiling_bps: self.storage.p_rent_ceiling_bps.at(pid).read(),
            lock_years: self.storage.p_lock_years.at(pid).read(),
            target_group: self.storage.p_target_group.at(pid).read(),
            is_set: self.storage.p_covenant_set.at(pid).read(),
        }
    }

    /// J1: number of listings ever submitted (ids are 0..count).
    #[external("utility")]
    unconstrained fn get_listing_count() -> pub u32 {
        self.storage.listing_count.read()
    }

    /// J1/J2: full listing view. `quality_score` is the floor average of
    /// council scores so far (0 until the first approval).
    #[external("utility")]
    unconstrained fn get_listing(listing_id: u32) -> pub ListingView {
        let lid = listing_id as Field;
        let approvals = self.storage.l_approvals.at(lid).read();
        let score_sum = self.storage.l_score_sum.at(lid).read();
        let quality_score =
            if approvals > 0 { (score_sum / approvals as u64) as u32 } else { 0 };
        ListingView {
            proposer: self.storage.l_proposer.at(lid).read(),
            ask_eur: self.storage.l_ask_eur.at(lid).read(),
            market_rent_ref_eur: self.storage.l_market_rent_ref_eur.at(lid).read(),
            dossier_hash: self.storage.l_dossier_hash.at(lid).read(),
            status: self.storage.l_status.at(lid).read(),
            approvals,
            quality_score,
        }
    }

    /// J1: the listing backing a proposal, as listing_id + 1 (0 = the proposal
    /// was created via the legacy direct path and has no listing).
    #[external("utility")]
    unconstrained fn get_proposal_listing_id_plus_one(proposal_id: u32) -> pub u32 {
        self.storage.p_listing_id_plus_one.at(proposal_id as Field).read()
    }

    #[external("public")]
    #[view]
    fn get_proposal_status_public(proposal_id: u32) -> pub u8 {
        let pid = proposal_id as Field;
        self.storage.p_status.at(pid).read()
    }

    #[external("public")]
    #[view]
    fn get_proposal_amount_public(proposal_id: u32) -> pub u64 {
        let pid = proposal_id as Field;
        self.storage.p_amount.at(pid).read()
    }

    // W1b: public covenant accessors so HousingFund (and other contracts) can read
    // a proposal's affordability terms cross-contract via `self.view(...)`. Returned
    // as primitives, matching the existing cross-contract read pattern -- no
    // CovenantView struct crosses the crate boundary. HousingFund depends on
    // governance (not vice versa), so the fund pulls these; governance never calls
    // the fund (which would be a circular crate dependency).

    #[external("public")]
    #[view]
    fn get_proposal_covenant_set_public(proposal_id: u32) -> pub bool {
        let pid = proposal_id as Field;
        self.storage.p_covenant_set.at(pid).read()
    }

    #[external("public")]
    #[view]
    fn get_proposal_rent_ceiling_bps_public(proposal_id: u32) -> pub u32 {
        let pid = proposal_id as Field;
        self.storage.p_rent_ceiling_bps.at(pid).read()
    }

    #[external("public")]
    #[view]
    fn get_proposal_lock_years_public(proposal_id: u32) -> pub u32 {
        let pid = proposal_id as Field;
        self.storage.p_lock_years.at(pid).read()
    }

    #[external("utility")]
    unconstrained fn get_voting_window_blocks() -> pub u32 {
        self.storage.voting_window_blocks.read()
    }

    #[external("utility")]
    unconstrained fn get_min_quorum_votes() -> pub u32 {
        self.storage.min_quorum_votes.read()
    }
}
