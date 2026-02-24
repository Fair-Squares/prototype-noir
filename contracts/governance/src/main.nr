use ::aztec::macros::aztec;

// Governance - private voting on property acquisitions.
//
// Privacy:
//   - WHO votes is hidden (private function + nullifier prevents double-voting)
//   - Vote tallies are accumulated via private->public enqueue pattern
//
// Flow:
//   1. Council or HousingFund creates proposals - public
//   2. FSFT holders call cast_vote(proposal_id, vote_yes) - private
//   3. After deadline, anyone calls finalize_proposal() - public
#[aztec]
pub contract Governance {
    use ::aztec::{
        macros::{
            functions::{external, initializer, view, only_self},
            storage::storage,
        },
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PublicMutable},
    };
    use ::aztec::protocol::hash::poseidon2_hash;

    // Proposal status constants
    global STATUS_ACTIVE: u8 = 0;
    global STATUS_PASSED: u8 = 1;
    global STATUS_FAILED: u8 = 2;
    global STATUS_EXECUTED: u8 = 3;

    // Voting deadline: number of blocks after proposal creation
    global VOTING_PERIOD_BLOCKS: u32 = 100;

    #[storage]
    struct Storage<Context> {
        // Linked contract addresses
        housing_fund: PublicMutable<AztecAddress, Context>,
        council: PublicMutable<AztecAddress, Context>,

        // Proposal counter
        proposal_count: PublicMutable<u32, Context>,

        // Per-proposal storage (indexed by proposal_id as Field)
        // Description hash (of off-chain content)
        p_desc_hash: Map<Field, PublicMutable<Field, Context>, Context>,
        // Requested amount (EUR, 18 decimals)
        p_amount: Map<Field, PublicMutable<u128, Context>, Context>,
        // Vote tallies
        p_yes_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        p_no_votes: Map<Field, PublicMutable<u32, Context>, Context>,
        // Status: 0=active, 1=passed, 2=failed, 3=executed
        p_status: Map<Field, PublicMutable<u8, Context>, Context>,
        // Deadline block number
        p_deadline: Map<Field, PublicMutable<u32, Context>, Context>,
        // Proposer address
        p_proposer: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(housing_fund: AztecAddress, council: AztecAddress) {
        assert(!housing_fund.is_zero(), "invalid housing_fund");
        assert(!council.is_zero(), "invalid council");
        self.storage.housing_fund.write(housing_fund);
        self.storage.council.write(council);
        self.storage.proposal_count.write(0);
    }

    // PUBLIC: Create a new proposal
    #[external("public")]
    fn create_proposal(
        description_hash: Field,
        amount: u128,
    ) -> pub u32 {
        let caller = self.context.maybe_msg_sender().unwrap();
        assert(
            self.storage.council.read().eq(caller) |
            self.storage.housing_fund.read().eq(caller),
            "only council or housing fund can propose"
        );

        let proposal_id = self.storage.proposal_count.read();
        let pid = proposal_id as Field;
        let deadline = self.context.block_number() + VOTING_PERIOD_BLOCKS;

        self.storage.p_desc_hash.at(pid).write(description_hash);
        self.storage.p_amount.at(pid).write(amount);
        self.storage.p_yes_votes.at(pid).write(0);
        self.storage.p_no_votes.at(pid).write(0);
        self.storage.p_status.at(pid).write(STATUS_ACTIVE);
        self.storage.p_deadline.at(pid).write(deadline);
        self.storage.p_proposer.at(pid).write(caller);

        self.storage.proposal_count.write(proposal_id + 1);
        proposal_id
    }

    // PRIVATE: Cast a vote - the core ZK feature
    // WHO votes is hidden. A nullifier prevents double-voting.
    #[external("private")]
    fn cast_vote(proposal_id: u32, vote_yes: bool) {
        let pid = proposal_id as Field;

        let voter = self.context.maybe_msg_sender().unwrap();

        // Create nullifier to prevent double-voting
        // nullifier = hash(voter, proposal_id)
        let nullifier = poseidon2_hash(
            [voter.to_field(), pid]
        );
        self.context.push_nullifier(nullifier);

        // Enqueue public state update
        if vote_yes {
            self.enqueue(
                Governance::at(self.context.this_address())._increment_yes_votes(proposal_id)
            );
        } else {
            self.enqueue(
                Governance::at(self.context.this_address())._increment_no_votes(proposal_id)
            );
        }
    }

    // PUBLIC: Finalize a proposal after voting period ends
    #[external("public")]
    fn finalize_proposal(proposal_id: u32) {
        let pid = proposal_id as Field;
        assert(
            self.storage.p_status.at(pid).read() == STATUS_ACTIVE,
            "proposal is not active"
        );

        let deadline = self.storage.p_deadline.at(pid).read();
        let now = self.context.block_number();
        assert(now > deadline, "voting period has not ended");

        let yes_votes = self.storage.p_yes_votes.at(pid).read();
        let no_votes = self.storage.p_no_votes.at(pid).read();

        if yes_votes > no_votes {
            self.storage.p_status.at(pid).write(STATUS_PASSED);
        } else {
            self.storage.p_status.at(pid).write(STATUS_FAILED);
        }
    }

    // INTERNAL: Called from cast_vote via enqueue
    #[external("public")]
    #[only_self]
    fn _increment_yes_votes(proposal_id: u32) {
        let pid = proposal_id as Field;
        let current = self.storage.p_yes_votes.at(pid).read();
        self.storage.p_yes_votes.at(pid).write(current + 1);
    }

    #[external("public")]
    #[only_self]
    fn _increment_no_votes(proposal_id: u32) {
        let pid = proposal_id as Field;
        let current = self.storage.p_no_votes.at(pid).read();
        self.storage.p_no_votes.at(pid).write(current + 1);
    }

    // VIEW FUNCTIONS

    #[external("public")]
    #[view]
    fn get_proposal_count() -> pub u32 {
        self.storage.proposal_count.read()
    }

    #[external("public")]
    #[view]
    fn get_proposal(proposal_id: u32) -> pub (Field, u128, u32, u32, u8, u32) {
        let pid = proposal_id as Field;
        (
            self.storage.p_desc_hash.at(pid).read(),
            self.storage.p_amount.at(pid).read(),
            self.storage.p_yes_votes.at(pid).read(),
            self.storage.p_no_votes.at(pid).read(),
            self.storage.p_status.at(pid).read(),
            self.storage.p_deadline.at(pid).read(),
        )
    }

    #[external("public")]
    #[view]
    fn get_proposal_status(proposal_id: u32) -> pub u8 {
        let pid = proposal_id as Field;
        self.storage.p_status.at(pid).read()
    }
}
