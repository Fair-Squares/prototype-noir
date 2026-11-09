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
            traits::{Deserialize, Packable, Serialize, ToField},
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
    // J3: the protocol's affordability baseline -- covenant rent ceilings on
    // listing-backed proposals must sit at least this far below the
    // appraiser-attested market rent ("at least 20% below market").
    global AFFORDABILITY_BASELINE_BPS: u64 = 2000;

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

    // -- Packed storage groups ------------------------------------------------
    // STORAGE GROUPING (aztec-nr v6 / Noir 1.0): the `#[aztec]` macro builds one
    // generic self type over the whole Storage struct, and the Noir compiler
    // caps that type's size (MAX_TYPE_COMPLEXITY = 100k nodes) in every PRIVATE
    // function. Each `PublicMutable` field costs ~2 PrivateContext expansions
    // and each `Map` ~4, which put the old 34-field layout over the cap. Related
    // scalars are therefore packed into one struct per slot group (one per
    // proposal / listing / covenant); each group is read-modify-written as a
    // unit. The external ABI is unchanged.
    #[derive(Packable, Eq)]
    pub struct Links {
        pub housing_fund: AztecAddress,
        pub kyc_verifier: AztecAddress,
        pub fund_token: AztecAddress,
        // Admin (the deployer) -- gates execute_proposal so only an authorized
        // caller can flip a PASSED proposal to EXECUTED.
        pub admin: AztecAddress,
    }

    #[derive(Packable, Eq)]
    pub struct Params {
        pub voting_window_blocks: u32,
        pub min_quorum_votes: u32,
        // Proposal counter
        pub proposal_count: u32,
        // J1/J2: listing counter + council approval threshold.
        pub listing_count: u32,
        pub min_council_approvals: u32,
        // J4: funding queue of PASSED listing-backed proposals, appended by
        // finalize_proposal and drained by HousingFund.match_next (the call
        // direction is fund -> governance because housing_fund imports this
        // crate, never the reverse). head advances past settled entries the
        // same way the H2b withdraw cursor does.
        pub fq_head: u32,
        pub fq_tail: u32,
    }

    // Per-proposal storage (indexed by proposal_id as Field).
    #[derive(Packable, Eq)]
    pub struct Proposal {
        pub desc_hash: Field,
        pub amount: u64,
        pub yes_votes: u32,
        pub no_votes: u32,
        pub status: u8,
        pub proposer: AztecAddress,
        pub created_block: u32,
        pub deadline_block: u32,
        // Proposal -> listing back-reference, stored as listing_id + 1 so an
        // unwritten slot (0) means "no listing" (legacy direct proposals).
        pub listing_id_plus_one: u32,
    }

    // W1: per-proposal affordability covenant. An unwritten slot reads zero /
    // false, so a proposal with no covenant reports is_set == false.
    #[derive(Packable, Eq)]
    pub struct Covenant {
        pub rent_ceiling_bps: u32,
        pub lock_years: u32,
        pub target_group: Field,
        pub is_set: bool,
    }

    // J1/J2: property listings -- the pre-proposal onboarding + council stage
    // (journey steps 2 and 3a). Keyed by listing_id as Field.
    #[derive(Packable, Eq)]
    pub struct Listing {
        pub proposer: AztecAddress,
        pub ask_eur: u64,
        // Appraiser-attested MONTHLY market rent (EUR). Part of the dossier;
        // J3 anchors the affordability-covenant baseline check to it.
        pub market_rent_ref_eur: u64,
        // Poseidon2 hash of the off-chain document bundle (appraiser report +
        // technical assessment). The chain stores commitment, not content.
        pub dossier_hash: Field,
        pub status: u8,
        // Council review accumulators: floor-average score = score_sum / approvals.
        pub score_sum: u64,
        pub approvals: u32,
    }

    #[storage]
    struct Storage<Context> {
        links: PublicMutable<Links, Context>,
        params: PublicMutable<Params, Context>,
        proposals: Map<Field, PublicMutable<Proposal, Context>, Context>,
        covenants: Map<Field, PublicMutable<Covenant, Context>, Context>,
        listings: Map<Field, PublicMutable<Listing, Context>, Context>,
        // Double-approve guard: poseidon2([listing_id, councillor]) -> approved?
        l_council_approved: Map<Field, PublicMutable<bool, Context>, Context>,
        // J4 funding queue entries (index -> proposal_id).
        fq_pids: Map<Field, PublicMutable<u32, Context>, Context>,

        // V2: nullifier per (proposal_id, voter) for secret-ballot private voting.
        vote_claims: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
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
        // The deployer is the admin authorized to execute passed proposals.
        self.storage.links.write(Links {
            housing_fund,
            kyc_verifier,
            fund_token,
            admin: self.msg_sender(),
        });
        // J2: one council approval suffices by default (demo posture); raise
        // via set_min_council_approvals. Initialized here (not a constructor
        // arg) so the deploy/bootstrap surface doesn't change.
        self.storage.params.write(Params {
            voting_window_blocks,
            min_quorum_votes,
            proposal_count: 0,
            listing_count: 0,
            min_council_approvals: 1,
            fq_head: 0,
            fq_tail: 0,
        });
    }

    /// J2: admin raises/lowers the council approval threshold (>= 1).
    #[external("public")]
    fn set_min_council_approvals(min_approvals: u32) {
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");
        assert(min_approvals > 0, "invalid approval threshold");
        let mut params = self.storage.params.read();
        params.min_council_approvals = min_approvals;
        self.storage.params.write(params);
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
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "investor role required");

        let mut params = self.storage.params.read();
        let proposal_id = params.proposal_count;
        let pid = proposal_id as Field;
        let created_block = self.context.block_number();
        let deadline_block = created_block + params.voting_window_blocks;

        self.storage.proposals.at(pid).write(Proposal {
            desc_hash: description_hash,
            amount,
            yes_votes: 0,
            no_votes: 0,
            status: STATUS_ACTIVE,
            proposer: caller,
            created_block,
            deadline_block,
            listing_id_plus_one: 0,
        });

        params.proposal_count = proposal_id + 1;
        self.storage.params.write(params);
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
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        assert(
            self.view(kyc_contract.is_property_owner(caller)),
            "property owner role required",
        );
        assert(ask_eur > 0, "ask must be positive");
        assert(market_rent_ref_eur > 0, "market rent reference required");
        assert(dossier_hash != 0, "dossier hash required");

        let mut params = self.storage.params.read();
        let listing_id = params.listing_count;
        let lid = listing_id as Field;
        self.storage.listings.at(lid).write(Listing {
            proposer: caller,
            ask_eur,
            market_rent_ref_eur,
            dossier_hash,
            status: LISTING_SUBMITTED,
            score_sum: 0,
            approvals: 0,
        });
        params.listing_count = listing_id + 1;
        self.storage.params.write(params);
        listing_id
    }

    /// J2: a council member approves a listing with a 0..=100 quality score
    /// (price-quality judgment; J4 ranks the funding queue by the average).
    /// The listing flips to COUNCIL_APPROVED once min_council_approvals
    /// distinct members have approved.
    #[external("public")]
    fn council_approve(listing_id: u32, quality_score: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        assert(self.view(kyc_contract.is_council(caller)), "council role required");
        let params = self.storage.params.read();
        assert(listing_id < params.listing_count, "unknown listing");
        assert(quality_score <= MAX_QUALITY_SCORE, "score above 100");

        let lid = listing_id as Field;
        let mut listing = self.storage.listings.at(lid).read();
        assert_eq(listing.status, LISTING_SUBMITTED, "listing not under review");

        // One approval per (listing, councillor).
        let guard_key = poseidon2_hash([lid, caller.to_field()]);
        assert(
            !self.storage.l_council_approved.at(guard_key).read(),
            "councillor already approved",
        );
        self.storage.l_council_approved.at(guard_key).write(true);

        listing.approvals += 1;
        listing.score_sum += quality_score as u64;

        if listing.approvals >= params.min_council_approvals {
            listing.status = LISTING_COUNCIL_APPROVED;
        }
        self.storage.listings.at(lid).write(listing);
    }

    /// J2: a single council rejection is final (fail-closed; the owner can
    /// resubmit an amended dossier as a new listing).
    #[external("public")]
    fn council_reject(listing_id: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        assert(self.view(kyc_contract.is_council(caller)), "council role required");
        assert(listing_id < self.storage.params.read().listing_count, "unknown listing");

        let lid = listing_id as Field;
        let mut listing = self.storage.listings.at(lid).read();
        assert_eq(listing.status, LISTING_SUBMITTED, "listing not under review");
        listing.status = LISTING_REJECTED;
        self.storage.listings.at(lid).write(listing);
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
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        assert(self.view(kyc_contract.is_investor(caller)), "investor role required");
        let mut params = self.storage.params.read();
        assert(listing_id < params.listing_count, "unknown listing");

        let lid = listing_id as Field;
        let mut listing = self.storage.listings.at(lid).read();
        assert_eq(listing.status, LISTING_COUNCIL_APPROVED, "listing not council-approved");

        let amount = listing.ask_eur;
        let proposal_id = params.proposal_count;
        let pid = proposal_id as Field;
        let created_block = self.context.block_number();
        let deadline_block = created_block + params.voting_window_blocks;

        self.storage.proposals.at(pid).write(Proposal {
            desc_hash: description_hash,
            amount,
            yes_votes: 0,
            no_votes: 0,
            status: STATUS_ACTIVE,
            proposer: caller,
            created_block,
            deadline_block,
            listing_id_plus_one: listing_id + 1,
        });

        params.proposal_count = proposal_id + 1;
        self.storage.params.write(params);
        listing.status = LISTING_PROPOSED;
        self.storage.listings.at(lid).write(listing);
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
        let links = self.storage.links.read();
        let kyc_addr = links.kyc_verifier;
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        assert(deposit_note_contract == links.housing_fund, "deposit note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        let pid = proposal_id as Field;
        let mut proposal = self.storage.proposals.at(pid).read();
        assert(proposal.status == STATUS_ACTIVE, "proposal is not active");
        // A proposal stays ACTIVE until someone manually finalizes it, so the
        // STATUS_ACTIVE gate alone would let a voter wait for the observable
        // yes/no split and then cast a decisive vote after the window closed.
        // Reject any tally past the deadline (finalize requires block >= deadline,
        // so the voting window is exactly [created, deadline)).
        assert(self.context.block_number() < proposal.deadline_block, "voting window closed");

        if vote_yes {
            proposal.yes_votes += 1;
        } else {
            proposal.no_votes += 1;
        }
        self.storage.proposals.at(pid).write(proposal);
    }

    // -- Finalize a proposal ----------------------------------------------

    #[external("public")]
    fn finalize_proposal(proposal_id: u32) {
        let pid = proposal_id as Field;
        let mut proposal = self.storage.proposals.at(pid).read();
        assert(proposal.status == STATUS_ACTIVE, "proposal is not active");

        let current_block = self.context.block_number();
        assert(current_block >= proposal.deadline_block, "voting window still open");

        let yes_votes = proposal.yes_votes;
        let no_votes = proposal.no_votes;
        let mut params = self.storage.params.read();

        assert(yes_votes + no_votes >= params.min_quorum_votes, "quorum not reached");

        // Strict-majority rule: a proposal PASSES only with strictly more YES
        // than NO votes. A tie (yes == no) falls into the `else` branch and
        // resolves to FAILED -- the proposer must clear, not merely meet, the
        // opposition. (L33)
        if yes_votes > no_votes {
            proposal.status = STATUS_PASSED;
            // J4: listing-backed proposals queue for priority matching instead
            // of ad-hoc admin execution. Legacy direct proposals keep the
            // admin execute_proposal path.
            if proposal.listing_id_plus_one > 0 {
                let tail = params.fq_tail;
                self.storage.fq_pids.at(tail as Field).write(proposal_id);
                params.fq_tail = tail + 1;
                self.storage.params.write(params);
            }
        } else {
            proposal.status = STATUS_FAILED;
        }
        self.storage.proposals.at(pid).write(proposal);
    }

    // -- J4: funding-queue primitives for HousingFund.match_next --------------
    //
    // Same W1b pattern as the covenant accessors: primitive #[view] functions
    // (no structs across the crate boundary) that the fund reads while scanning
    // the queue, plus the fund-authorized status flip.

    #[external("public")]
    #[view]
    fn get_funding_queue_head_public() -> pub u32 {
        self.storage.params.read().fq_head
    }

    #[external("public")]
    #[view]
    fn get_funding_queue_tail_public() -> pub u32 {
        self.storage.params.read().fq_tail
    }

    #[external("public")]
    #[view]
    fn get_funding_queue_entry_public(index: u32) -> pub u32 {
        assert(index < self.storage.params.read().fq_tail, "queue index out of range");
        self.storage.fq_pids.at(index as Field).read()
    }

    /// J4: the proposal's matching priority, packed into one u64 so the fund
    /// reads a single view per candidate: council quality score (dominant,
    /// 0..=100) * 1e9 + covenant discount depth in EUR/mo below the baseline
    /// cap (secondary, saturated at 1e9-1). FIFO order is the implicit
    /// tie-break (the fund scans oldest-first and only a strictly greater
    /// priority displaces the incumbent). Proposals without a covenant score
    /// zero discount; only listing-backed proposals are ever enqueued.
    #[external("public")]
    #[view]
    fn get_proposal_priority_public(proposal_id: u32) -> pub u64 {
        let pid = proposal_id as Field;
        let proposal = self.storage.proposals.at(pid).read();
        let listing_plus_one = proposal.listing_id_plus_one;
        assert(listing_plus_one > 0, "proposal has no listing");
        let lid = (listing_plus_one - 1) as Field;
        let listing = self.storage.listings.at(lid).read();

        let approvals = listing.approvals;
        let score = if approvals > 0 { (listing.score_sum / approvals as u64) } else { 0 };

        let mut discount: u64 = 0;
        let covenant = self.storage.covenants.at(pid).read();
        if covenant.is_set {
            let market_rent_ref = listing.market_rent_ref_eur;
            let ask = proposal.amount;
            let ceiling_bps = covenant.rent_ceiling_bps;
            let ceiling_monthly = ((ask * ceiling_bps as u64) / 10000) / 12;
            let baseline_cap =
                (market_rent_ref * (10000 - AFFORDABILITY_BASELINE_BPS)) / 10000;
            // >= 0 by the J3 baseline assert at covenant attach.
            discount = baseline_cap - ceiling_monthly;
            if discount > 999_999_999 {
                discount = 999_999_999;
            }
        }
        score * 1_000_000_000 + discount
    }

    /// J4: HousingFund.match_next flips the matched proposal to EXECUTED and
    /// advances the queue head past the settled prefix it scanned. Only the
    /// wired fund may call this (the fund performs the balance check and the
    /// distribution open in the same tx). new_head is trusted within bounds --
    /// the fund is protocol-owned, wired at deploy, and only ever advances
    /// head past non-PASSED entries.
    #[external("public")]
    fn mark_matched(proposal_id: u32, new_head: u32) {
        assert_eq(
            self.msg_sender(),
            self.storage.links.read().housing_fund,
            "only the housing fund can match",
        );
        let pid = proposal_id as Field;
        let mut proposal = self.storage.proposals.at(pid).read();
        assert(proposal.status == STATUS_PASSED, "proposal must be in PASSED state");
        proposal.status = STATUS_EXECUTED;
        self.storage.proposals.at(pid).write(proposal);

        let mut params = self.storage.params.read();
        assert((new_head >= params.fq_head) & (new_head <= params.fq_tail), "invalid queue head");
        params.fq_head = new_head;
        self.storage.params.write(params);
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
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");

        let pid = proposal_id as Field;

        let mut proposal = self.storage.proposals.at(pid).read();
        assert(proposal.status == STATUS_PASSED, "proposal must be in PASSED state");

        proposal.status = STATUS_EXECUTED;
        self.storage.proposals.at(pid).write(proposal);
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
        let proposal = self.storage.proposals.at(pid).read();
        assert_eq(self.msg_sender(), proposal.proposer, "only the proposer can attach a covenant");
        assert(proposal.status == STATUS_ACTIVE, "proposal is not active");
        assert(!self.storage.covenants.at(pid).read().is_set, "covenant already set");
        let cast = proposal.yes_votes + proposal.no_votes;
        assert(cast == 0, "covenant must be set before voting begins");

        // Sane bounds: a positive ceiling no greater than 100%/yr and a finite lock.
        assert(rent_ceiling_bps > 0, "rent ceiling must be positive");
        assert(rent_ceiling_bps <= 10000, "rent ceiling out of range");
        assert(lock_years > 0, "lock years must be positive");
        assert(lock_years <= 100, "lock years out of range");

        // J3: the "at least 20% below market" BASELINE, enforced on-chain.
        // For a listing-backed proposal the covenant's monthly EUR ceiling
        // (ask * ceiling_bps / 10000 / 12 -- the same formula HousingFund
        // enforces at record_rent, with ask standing in for acquisition value)
        // must not exceed (100% - baseline) of the appraiser-attested monthly
        // market rent from the dossier. A covenant may promise MORE discount,
        // never less. Legacy direct proposals have no market reference
        // (listing_plus_one == 0) and skip the check -- they are retired with
        // the direct path. Integer bps math per house rules; u64 products are
        // safe (ask <= ~1.8e15 EUR before ask * ceiling_bps could overflow).
        let listing_plus_one = proposal.listing_id_plus_one;
        if listing_plus_one > 0 {
            let lid = (listing_plus_one - 1) as Field;
            let market_rent_ref = self.storage.listings.at(lid).read().market_rent_ref_eur;
            let ask = proposal.amount;
            let ceiling_monthly = ((ask * rent_ceiling_bps as u64) / 10000) / 12;
            let baseline_cap = (market_rent_ref * (10000 - AFFORDABILITY_BASELINE_BPS)) / 10000;
            assert(ceiling_monthly <= baseline_cap, "covenant above affordability baseline");
        }

        self.storage.covenants.at(pid).write(Covenant {
            rent_ceiling_bps,
            lock_years,
            target_group,
            is_set: true,
        });
    }

    // -- View functions ---------------------------------------------------

    #[external("utility")]
    unconstrained fn get_proposal_count() -> pub u32 {
        self.storage.params.read().proposal_count
    }

    #[external("utility")]
    unconstrained fn get_proposal(proposal_id: u32) -> pub ProposalView {
        let p = self.storage.proposals.at(proposal_id as Field).read();
        ProposalView {
            desc_hash: p.desc_hash,
            amount: p.amount,
            yes_votes: p.yes_votes,
            no_votes: p.no_votes,
            status: p.status,
            created_block: p.created_block,
            deadline_block: p.deadline_block,
        }
    }

    #[external("utility")]
    unconstrained fn get_proposal_status(proposal_id: u32) -> pub u8 {
        self.storage.proposals.at(proposal_id as Field).read().status
    }

    #[external("utility")]
    unconstrained fn get_proposal_covenant(proposal_id: u32) -> pub CovenantView {
        let c = self.storage.covenants.at(proposal_id as Field).read();
        CovenantView {
            rent_ceiling_bps: c.rent_ceiling_bps,
            lock_years: c.lock_years,
            target_group: c.target_group,
            is_set: c.is_set,
        }
    }

    /// J1: number of listings ever submitted (ids are 0..count).
    #[external("utility")]
    unconstrained fn get_listing_count() -> pub u32 {
        self.storage.params.read().listing_count
    }

    /// J1/J2: full listing view. `quality_score` is the floor average of
    /// council scores so far (0 until the first approval).
    #[external("utility")]
    unconstrained fn get_listing(listing_id: u32) -> pub ListingView {
        let l = self.storage.listings.at(listing_id as Field).read();
        let approvals = l.approvals;
        let quality_score =
            if approvals > 0 { (l.score_sum / approvals as u64) as u32 } else { 0 };
        ListingView {
            proposer: l.proposer,
            ask_eur: l.ask_eur,
            market_rent_ref_eur: l.market_rent_ref_eur,
            dossier_hash: l.dossier_hash,
            status: l.status,
            approvals,
            quality_score,
        }
    }

    /// J1: the listing backing a proposal, as listing_id + 1 (0 = the proposal
    /// was created via the legacy direct path and has no listing).
    #[external("utility")]
    unconstrained fn get_proposal_listing_id_plus_one(proposal_id: u32) -> pub u32 {
        self.storage.proposals.at(proposal_id as Field).read().listing_id_plus_one
    }

    #[external("public")]
    #[view]
    fn get_proposal_status_public(proposal_id: u32) -> pub u8 {
        self.storage.proposals.at(proposal_id as Field).read().status
    }

    #[external("public")]
    #[view]
    fn get_proposal_amount_public(proposal_id: u32) -> pub u64 {
        self.storage.proposals.at(proposal_id as Field).read().amount
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
        self.storage.covenants.at(proposal_id as Field).read().is_set
    }

    #[external("public")]
    #[view]
    fn get_proposal_rent_ceiling_bps_public(proposal_id: u32) -> pub u32 {
        self.storage.covenants.at(proposal_id as Field).read().rent_ceiling_bps
    }

    #[external("public")]
    #[view]
    fn get_proposal_lock_years_public(proposal_id: u32) -> pub u32 {
        self.storage.covenants.at(proposal_id as Field).read().lock_years
    }

    #[external("utility")]
    unconstrained fn get_voting_window_blocks() -> pub u32 {
        self.storage.params.read().voting_window_blocks
    }

    #[external("utility")]
    unconstrained fn get_min_quorum_votes() -> pub u32 {
        self.storage.params.read().min_quorum_votes
    }
}
