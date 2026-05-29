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
    use deposit_note::DepositNote;
    use kyc_verifier::{KYCVerifier, credential_note::KycCredentialNote};
    use aztec::{
        history::note::assert_note_existed_by,
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        note::HintedNote,
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::{Deserialize, Serialize, ToField},
        },
        state_vars::{Map, Owned, PublicMutable, SingleUseClaim},
    };

    // Proposal status constants
    global STATUS_ACTIVE: u8 = 0;
    global STATUS_PASSED: u8 = 1;
    global STATUS_FAILED: u8 = 2;
    global STATUS_EXECUTED: u8 = 3;

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
    }

    // -- Create a new proposal --------------------------------------------

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

        // Consume the per-(proposal, voter) single-use nullifier.
        let pid = proposal_id as Field;
        self.storage.vote_claims.at(pid).at(caller).claim();

        // Compute the credential's revocation commitment for the public tail.
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
        let pid = proposal_id as Field;

        let status = self.storage.p_status.at(pid).read();
        assert(status == STATUS_PASSED, "proposal must be in PASSED state");

        self.storage.p_status.at(pid).write(STATUS_EXECUTED);
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

    #[external("utility")]
    unconstrained fn get_voting_window_blocks() -> pub u32 {
        self.storage.voting_window_blocks.read()
    }

    #[external("utility")]
    unconstrained fn get_min_quorum_votes() -> pub u32 {
        self.storage.min_quorum_votes.read()
    }
}
