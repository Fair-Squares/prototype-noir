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
    use aztec::{
        macros::{
            functions::{external, initializer},
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
        council: PublicMutable<AztecAddress, Context>,

        // Proposal counter
        proposal_count: PublicMutable<u32, Context>,

        // Per-proposal storage (indexed by proposal_id as Field)
        p_desc_hash: Map<Field, PublicMutable<Field, Context>, Context>,
        p_amount: Map<Field, PublicMutable<u64, Context>, Context>,
        p_yes_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        p_no_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        p_status: Map<Field, PublicMutable<u8, Context>, Context>,
        p_proposer: Map<Field, PublicMutable<AztecAddress, Context>, Context>,

        // Track who has voted (voter_address + proposal_id -> bool)
        // Key: hash of voter + proposal_id (stored as a Map<Field, ...>)
        has_voted: Map<Field, PublicMutable<bool, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(housing_fund: AztecAddress, council: AztecAddress) {
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        assert(!council.is_zero(), "invalid council");
        self.storage.housing_fund.write(housing_fund);
        self.storage.council.write(council);
        self.storage.proposal_count.write(0);
    }

    // -- Create a new proposal --------------------------------------------

    #[external("public")]
    fn create_proposal(description_hash: Field, amount: u64) -> pub u32 {
        let caller = self.msg_sender();
        // Prototype: any account can create proposals.
        // Production: restrict to council, verified investors, or DAO members.
        assert(!caller.is_zero(), "invalid caller");

        let proposal_id = self.storage.proposal_count.read();
        let pid = proposal_id as Field;

        self.storage.p_desc_hash.at(pid).write(description_hash);
        self.storage.p_amount.at(pid).write(amount);
        self.storage.p_yes_votes.at(pid).write(0);
        self.storage.p_no_votes.at(pid).write(0);
        self.storage.p_status.at(pid).write(STATUS_ACTIVE);
        self.storage.p_proposer.at(pid).write(caller);

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

        // For prototype: anyone can finalize (no block deadline check)
        // Future: add deadline-based check

        let yes_votes = self.storage.p_yes_votes.at(pid).read();
        let no_votes = self.storage.p_no_votes.at(pid).read();

        // Require at least 1 vote to finalize
        assert(yes_votes + no_votes > 0, "no votes cast yet");

        if yes_votes > no_votes {
            self.storage.p_status.at(pid).write(STATUS_PASSED);
        } else {
            self.storage.p_status.at(pid).write(STATUS_FAILED);
        }
    }

    // -- Execute a passed proposal (marks as EXECUTED, triggers FSFT mint) ----
    // The actual FSFT minting is done by the admin (test0) via the API route
    // after this tx confirms, since cross-contract public calls are not used
    // in this prototype version.

    #[external("public")]
    fn execute_proposal(proposal_id: u32) {
        let pid = proposal_id as Field;
        let caller = self.msg_sender();
        let council = self.storage.council.read();
        let hf = self.storage.housing_fund.read();
        assert(
            council.eq(caller) | hf.eq(caller),
            "only council or housing fund can execute",
        );

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
    unconstrained fn get_proposal(proposal_id: u32) -> pub (Field, u64, u32, u32, u8) {
        let pid = proposal_id as Field;
        (
            self.storage.p_desc_hash.at(pid).read(),
            self.storage.p_amount.at(pid).read(),
            self.storage.p_yes_votes.at(pid).read(),
            self.storage.p_no_votes.at(pid).read(),
            self.storage.p_status.at(pid).read(),
        )
    }

    #[external("utility")]
    unconstrained fn get_proposal_status(proposal_id: u32) -> pub u8 {
        let pid = proposal_id as Field;
        self.storage.p_status.at(pid).read()
    }
}
