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
    use fund_token::FundToken;
    use kyc_verifier::KYCVerifier;
    use aztec::{
        macros::{
            functions::{external, initializer, view},
            storage::storage,
        },
        protocol::{
            address::AztecAddress,
            traits::ToField,
        },
        state_vars::{Map, PublicMutable},
    };

    // Proposal status constants
    global STATUS_ACTIVE: u8 = 0;
    global STATUS_PASSED: u8 = 1;
    global STATUS_FAILED: u8 = 2;
    global STATUS_EXECUTED: u8 = 3;

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

        // Track who has voted (voter_address + proposal_id -> bool)
        // Key: hash of voter + proposal_id (stored as a Map<Field, ...>)
        has_voted: Map<Field, PublicMutable<bool, Context>, Context>,
        // Mirrored deposit tickets synced from HousingFund.
        user_deposit_ticket: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
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

    // -- Cast a vote (public for prototype) -------------------------------
    // Double-vote prevention uses a public map keyed by voter+proposal hash.
    // Future: replace with private voting + nullifiers.

    #[external("public")]
    fn cast_vote(proposal_id: u32, vote_yes: bool) {
        let pid = proposal_id as Field;
        let voter = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(voter));
        assert(is_investor, "investor role required");

        let fund_token = FundToken::at(self.storage.fund_token.read());
        let has_deposit_ticket = self.storage.user_deposit_ticket.at(voter).read() > 0;
        let has_public_fsft = self.view(fund_token.public_balance_of_public(voter)) > 0;
        let has_private_holder_proof = self.view(fund_token.has_private_holder_proof(voter));
        assert(
            has_deposit_ticket | has_public_fsft | has_private_holder_proof,
            "fund exposure required for voting",
        );

        // Check proposal is active
        assert(
            self.storage.p_status.at(pid).read() == STATUS_ACTIVE,
            "proposal is not active",
        );

        // Simple double-vote prevention using voter address + proposal_id as key
        // We use the voter's field representation XOR'd with pid as a simple hash
        let vote_key = voter.to_field() + pid;
        assert(!self.storage.has_voted.at(vote_key).read(), "already voted");
        self.storage.has_voted.at(vote_key).write(true);

        // Tally the vote
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
    unconstrained fn get_proposal(proposal_id: u32) -> pub (Field, u64, u32, u32, u8, u32, u32) {
        let pid = proposal_id as Field;
        (
            self.storage.p_desc_hash.at(pid).read(),
            self.storage.p_amount.at(pid).read(),
            self.storage.p_yes_votes.at(pid).read(),
            self.storage.p_no_votes.at(pid).read(),
            self.storage.p_status.at(pid).read(),
            self.storage.p_created_block.at(pid).read(),
            self.storage.p_deadline_block.at(pid).read(),
        )
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

    #[external("public")]
    fn sync_deposit_ticket(user: AztecAddress, ticket_amount: u64) {
        assert_eq(self.msg_sender(), self.storage.housing_fund.read(), "only housing fund can sync tickets");
        self.storage.user_deposit_ticket.at(user).write(ticket_amount);
    }

    #[external("public")]
    #[view]
    fn get_voting_eligibility(user: AztecAddress) -> pub (bool, bool, bool, bool, bool) {
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let fund_token = FundToken::at(self.storage.fund_token.read());

        let investor_role = self.view(kyc_contract.is_investor(user));
        let has_deposit_ticket = self.storage.user_deposit_ticket.at(user).read() > 0;
        let has_public_fsft = self.view(fund_token.public_balance_of_public(user)) > 0;
        let has_private_holder_proof = self.view(fund_token.has_private_holder_proof(user));
        let can_vote = investor_role & (has_deposit_ticket | has_public_fsft | has_private_holder_proof);

        (
            investor_role,
            has_deposit_ticket,
            has_public_fsft,
            has_private_holder_proof,
            can_vote,
        )
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
