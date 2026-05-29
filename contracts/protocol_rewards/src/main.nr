pub mod reward_claim_note;
mod test;

use aztec::macros::aztec;

/// ProtocolRewards -- 10-year protocol token distribution controller.
///
/// The contract stores epoch checkpoints and per-user weighted allocations.
/// V2 additive: per-user reward allocations are mirrored as RewardClaimNotes
/// in the recipient's PXE for future private claim flows.
#[aztec]
pub contract ProtocolRewards {
    use crate::reward_claim_note::RewardClaimNote;
    use token_contract::Token;
    use kyc_verifier::KYCVerifier;
    use aztec::{
        history::note::assert_note_existed_by,
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{
            constants::MAX_NOTES_PER_PAGE,
            HintedNote,
            note_getter_options::NoteStatus,
            utils::compute_confirmed_note_hash_for_nullification,
        },
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::{Deserialize, Serialize, ToField},
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable, SingleUseClaim, StateVariable},
        utils::array,
    };

    #[derive(Serialize, Deserialize)]
    pub struct UserStats {
        pub claimable: u64,
        pub total_claimed: u64,
        pub last_claimed_epoch: u32,
    }

    #[derive(Serialize, Deserialize)]
    pub struct EpochStats {
        pub open: bool,
        pub emission: u64,
        pub deposit_total_weight: u64,
        pub fsft_total_weight: u64,
        pub vote_total_weight: u64,
        pub allocated: u64,
    }

    #[derive(Serialize, Deserialize)]
    pub struct RewardsConfig {
        pub total_distribution_pool: u64,
        pub total_distributed: u64,
        pub total_claimed: u64,
        pub current_epoch: u32,
        pub total_epochs: u32,
        pub claim_min: u64,
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,

        protocol_token: PublicMutable<AztecAddress, Context>,
        fsft_token: PublicMutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        governance: PublicMutable<AztecAddress, Context>,
        kyc_verifier: PublicMutable<AztecAddress, Context>,

        total_distribution_pool: PublicMutable<u64, Context>,
        total_distributed: PublicMutable<u64, Context>,
        total_claimed: PublicMutable<u64, Context>,

        claim_min: PublicMutable<u64, Context>,
        total_epochs: PublicMutable<u32, Context>,
        current_epoch: PublicMutable<u32, Context>,

        epoch_open: Map<Field, PublicMutable<bool, Context>, Context>,
        epoch_emission: Map<Field, PublicMutable<u64, Context>, Context>,
        epoch_deposit_total_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        epoch_fsft_total_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        epoch_vote_total_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        epoch_allocated: Map<Field, PublicMutable<u64, Context>, Context>,

        user_epoch_deposit_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        user_epoch_fsft_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        user_epoch_vote_weight: Map<Field, PublicMutable<u64, Context>, Context>,
        user_epoch_allocated: Map<Field, PublicMutable<bool, Context>, Context>,

        user_claimable: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        user_total_claimed: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        user_last_claimed_epoch: Map<AztecAddress, PublicMutable<u32, Context>, Context>,

        // V2: per-recipient private reward records
        reward_notes: Owned<PrivateSet<RewardClaimNote, Context>, Context>,
        // V2: per (reward_note_hash, owner) single-use nullifier so a given
        // reward allocation can be claimed at most once.
        reward_claim_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        admin: AztecAddress,
        fsft_token: AztecAddress,
        housing_fund: AztecAddress,
        governance: AztecAddress,
        kyc_verifier: AztecAddress,
        claim_min: u64,
    ) {
        assert(!admin.is_zero(), "invalid admin");
        assert(!fsft_token.is_zero(), "invalid fsft token");
        assert(!housing_fund.is_zero(), "invalid housing fund");
        assert(!governance.is_zero(), "invalid governance");
        assert(!kyc_verifier.is_zero(), "invalid kyc verifier");
        assert(claim_min > 0, "invalid claim min");

        self.storage.admin.write(admin);
        self.storage.fsft_token.write(fsft_token);
        self.storage.housing_fund.write(housing_fund);
        self.storage.governance.write(governance);
        self.storage.kyc_verifier.write(kyc_verifier);
        // protocol_token is the AIP-20 Token minted on reward claims. Its
        // immutable minter must equal THIS contract, so it can only be deployed
        // after this contract's address is known -> wired via set_protocol_token.

        self.storage.total_distribution_pool.write(8_000_000);
        self.storage.total_distributed.write(0);
        self.storage.total_claimed.write(0);

        self.storage.claim_min.write(claim_min);
        self.storage.total_epochs.write(120);
        self.storage.current_epoch.write(0);
    }

    /// One-shot admin wiring of the protocol token (deployed after this contract
    /// with minter = this contract). Breaks the ProtocolRewards<->ProtocolToken
    /// deploy cycle imposed by the AIP-20 immutable minter.
    #[external("public")]
    fn set_protocol_token(protocol_token: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(self.storage.protocol_token.read().is_zero(), "protocol token already set");
        assert(!protocol_token.is_zero(), "invalid protocol token");
        self.storage.protocol_token.write(protocol_token);
    }

    /// Opens/checkpoints an epoch and records total weighting denominators.
    #[external("public")]
    fn checkpoint_epoch(
        epoch: u32,
        emission: u64,
        deposit_total_weight: u64,
        fsft_total_weight: u64,
        vote_total_weight: u64,
    ) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(epoch < self.storage.total_epochs.read(), "invalid epoch");
        assert(emission > 0, "emission must be positive");

        let year = epoch / 12;
        let bps = if year == 0 {
            1300
        } else if year == 1 {
            1200
        } else if year == 2 {
            1100
        } else if year == 3 {
            1000
        } else if year == 4 {
            1000
        } else if year == 5 {
            1000
        } else if year == 6 {
            900
        } else if year == 7 {
            900
        } else if year == 8 {
            800
        } else {
            800
        };
        let yearly = (self.storage.total_distribution_pool.read() * bps) / 10000;
        let target = yearly / 12;
        assert(emission <= target, "emission exceeds epoch target");

        let distributed = self.storage.total_distributed.read();
        let pool = self.storage.total_distribution_pool.read();
        assert(distributed + emission <= pool, "distribution pool exceeded");

        let eid = epoch as Field;
        self.storage.epoch_open.at(eid).write(true);
        self.storage.epoch_emission.at(eid).write(emission);
        self.storage.epoch_deposit_total_weight.at(eid).write(deposit_total_weight);
        self.storage.epoch_fsft_total_weight.at(eid).write(fsft_total_weight);
        self.storage.epoch_vote_total_weight.at(eid).write(vote_total_weight);

        self.storage.total_distributed.write(distributed + emission);
        self.storage.current_epoch.write(epoch);
    }

    /// Records per-user epoch weights and accrues claimable rewards.
    /// This function can be called once per user per epoch.
    #[external("public")]
    fn set_user_epoch_weights(
        epoch: u32,
        user: AztecAddress,
        deposit_weight: u64,
        fsft_weight: u64,
        vote_weight: u64,
    ) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(!user.is_zero(), "invalid user");

        let eid = epoch as Field;
        assert(self.storage.epoch_open.at(eid).read(), "epoch not open");

        let key = poseidon2_hash([user.to_field(), eid]);
        assert(!self.storage.user_epoch_allocated.at(key).read(), "already allocated");

        self.storage.user_epoch_deposit_weight.at(key).write(deposit_weight);
        self.storage.user_epoch_fsft_weight.at(key).write(fsft_weight);
        self.storage.user_epoch_vote_weight.at(key).write(vote_weight);

        let emission = self.storage.epoch_emission.at(eid).read();
        let deposit_total = self.storage.epoch_deposit_total_weight.at(eid).read();
        let fsft_total = self.storage.epoch_fsft_total_weight.at(eid).read();
        let vote_total = self.storage.epoch_vote_total_weight.at(eid).read();

        let deposit_pool = (emission * 40) / 100;
        let fsft_pool = (emission * 40) / 100;
        let governance_pool = emission - deposit_pool - fsft_pool;

        // FSFT reward-pool eligibility: holds public FSFT. The vendored AIP-20
        // Token exposes no on-chain private-holder attestation, so a purely
        // private FSFT holder must unshield to earn this sub-pool.
        let fsft = Token::at(self.storage.fsft_token.read());
        let public_balance: u128 = self.view(fsft.balance_of_public(user));
        let fsft_eligible = public_balance > 0;

        let deposit_share = if (deposit_pool > 0) & (deposit_total > 0) & (deposit_weight > 0) {
            (deposit_pool * deposit_weight) / deposit_total
        } else {
            0
        };

        let fsft_share = if (fsft_pool > 0) & (fsft_total > 0) & (fsft_weight > 0) {
            if fsft_eligible {
                (fsft_pool * fsft_weight) / fsft_total
            } else {
                0
            }
        } else {
            0
        };

        let governance_share = if (governance_pool > 0) & (vote_total > 0) & (vote_weight > 0) {
            (governance_pool * vote_weight) / vote_total
        } else {
            0
        };

        let reward = deposit_share + fsft_share + governance_share;

        if reward > 0 {
            let current = self.storage.user_claimable.at(user).read();
            self.storage.user_claimable.at(user).write(current + reward);

            let allocated = self.storage.epoch_allocated.at(eid).read();
            self.storage.epoch_allocated.at(eid).write(allocated + reward);
        }

        self.storage.user_epoch_allocated.at(key).write(true);
    }

    // -- V2: private reward allocation -----------------------------------
    //
    // Admin-only private mint of a RewardClaimNote to `recipient`. The note
    // lands in the recipient's PXE and represents an off-chain-visible
    // allocation. The full V2 claim flow (private nullifier + private
    // protocol-token mint) is staged for a follow-up.

    #[external("private")]
    fn allocate_reward_private(epoch: u32, recipient: AztecAddress, amount: u128) {
        assert(amount > 0, "amount must be positive");
        assert(!recipient.is_zero(), "invalid recipient");

        // Combined admin + epoch_open check in the enqueued public tail.
        // Without the epoch check, an admin could allocate rewards to a
        // closed epoch which a later claim flow would treat as valid.
        self.enqueue_self._assert_admin_and_epoch_open(epoch, self.msg_sender());

        let note = RewardClaimNote::new(recipient, amount, epoch);
        self.storage.reward_notes.at(recipient).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("public")]
    #[only_self]
    fn _assert_admin_and_epoch_open(epoch: u32, caller: AztecAddress) {
        assert_eq(caller, self.storage.admin.read(), "not admin");
        let eid = epoch as Field;
        assert(self.storage.epoch_open.at(eid).read(), "epoch not open");
    }

    // -- V2: private claim of a RewardClaimNote --------------------------------
    //
    // Consumes a RewardClaimNote via a per-(note_hash, owner) SingleUseClaim
    // nullifier and privately mints the protocol token to the caller via a
    // private-to-private cross-contract call. The recipient address never
    // crosses the private/public boundary -- only the aggregate total_claimed
    // counter is updated publicly.
    //
    // Requires ProtocolRewards to be the immutable minter of protocol_token
    // (set at the token's deploy via constructor_with_minter).
    //
    // `protocol_token_addr` is passed in as a parameter; the enqueued public
    // tail verifies it matches the configured storage so a malicious caller
    // cannot route the private mint through an attacker-controlled contract.

    #[external("private")]
    fn claim_reward_private(
        hinted_reward_note: HintedNote<RewardClaimNote>,
        protocol_token_addr: AztecAddress,
    ) {
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_reward_note);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "reward note not owned by caller");
        assert(confirmed.note.owner == caller, "reward note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "reward note from wrong contract",
        );

        // Single-use claim keyed by (note_hash, owner) prevents re-claim of
        // the same allocation.
        let note_hash_for_nullification =
            compute_confirmed_note_hash_for_nullification(confirmed);
        self.storage.reward_claim_nullifiers.at(note_hash_for_nullification).at(caller).claim();

        // Private cross-contract mint of protocol token to caller. The vendored
        // AIP-20 Token's mint_to_private sees msg_sender = ProtocolRewards and
        // passes _validate_minter (this contract is the token's immutable minter).
        let amount = confirmed.note.amount; // u128
        self.call(Token::at(protocol_token_addr).mint_to_private(caller, amount));

        // Public aggregate bump (u64 ledger) + protocol_token_addr verification.
        let amount_u64 = amount as u64;
        self.enqueue_self._record_private_claim(amount_u64, protocol_token_addr);
    }

    #[external("public")]
    #[only_self]
    fn _record_private_claim(amount: u64, supplied_protocol_token: AztecAddress) {
        assert(
            supplied_protocol_token == self.storage.protocol_token.read(),
            "protocol token mismatch",
        );
        let total = self.storage.total_claimed.read();
        self.storage.total_claimed.write(total + amount);
    }

    /// Claims all currently accrued rewards for caller.
    #[external("public")]
    fn claim() {
        let caller = self.msg_sender();
        let kyc = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc.is_investor(caller));
        assert(is_investor, "investor role required");

        let claimable = self.storage.user_claimable.at(caller).read();
        let claim_min = self.storage.claim_min.read();
        assert(claimable >= claim_min, "claimable below minimum");

        let protocol_token = Token::at(self.storage.protocol_token.read());
        self.call(protocol_token.mint_to_public(caller, claimable as u128));

        self.storage.user_claimable.at(caller).write(0);

        let user_claimed = self.storage.user_total_claimed.at(caller).read();
        self.storage.user_total_claimed.at(caller).write(user_claimed + claimable);
        self.storage.user_last_claimed_epoch.at(caller).write(self.storage.current_epoch.read());

        let total_claimed = self.storage.total_claimed.read();
        self.storage.total_claimed.write(total_claimed + claimable);
    }

    // -- View functions ----------------------------------------------------

    #[external("public")]
    #[view]
    fn get_claimable(user: AztecAddress) -> pub u64 {
        self.storage.user_claimable.at(user).read()
    }

    #[external("public")]
    #[view]
    fn get_user_stats(user: AztecAddress) -> pub UserStats {
        UserStats {
            claimable: self.storage.user_claimable.at(user).read(),
            total_claimed: self.storage.user_total_claimed.at(user).read(),
            last_claimed_epoch: self.storage.user_last_claimed_epoch.at(user).read(),
        }
    }

    #[external("public")]
    #[view]
    fn get_epoch_stats(epoch: u32) -> pub EpochStats {
        let eid = epoch as Field;
        EpochStats {
            open: self.storage.epoch_open.at(eid).read(),
            emission: self.storage.epoch_emission.at(eid).read(),
            deposit_total_weight: self.storage.epoch_deposit_total_weight.at(eid).read(),
            fsft_total_weight: self.storage.epoch_fsft_total_weight.at(eid).read(),
            vote_total_weight: self.storage.epoch_vote_total_weight.at(eid).read(),
            allocated: self.storage.epoch_allocated.at(eid).read(),
        }
    }

    #[external("public")]
    #[view]
    fn get_epoch_target(epoch: u32) -> pub u64 {
        let year = epoch / 12;
        let bps = if year == 0 {
            1300
        } else if year == 1 {
            1200
        } else if year == 2 {
            1100
        } else if year == 3 {
            1000
        } else if year == 4 {
            1000
        } else if year == 5 {
            1000
        } else if year == 6 {
            900
        } else if year == 7 {
            900
        } else if year == 8 {
            800
        } else {
            800
        };
        let yearly = (self.storage.total_distribution_pool.read() * bps) / 10000;
        yearly / 12
    }

    #[external("public")]
    #[view]
    fn get_rewards_config() -> pub RewardsConfig {
        RewardsConfig {
            total_distribution_pool: self.storage.total_distribution_pool.read(),
            total_distributed: self.storage.total_distributed.read(),
            total_claimed: self.storage.total_claimed.read(),
            current_epoch: self.storage.current_epoch.read(),
            total_epochs: self.storage.total_epochs.read(),
            claim_min: self.storage.claim_min.read(),
        }
    }

    #[external("public")]
    #[view]
    fn has_fsft_rewards_eligibility(user: AztecAddress) -> pub bool {
        let fsft = Token::at(self.storage.fsft_token.read());
        let public_balance: u128 = self.view(fsft.balance_of_public(user));
        public_balance > 0
    }

    /// PXE-side helper: fetch caller's RewardClaimNotes as paged HintedNote
    /// vec. Used by the V2 claim flow: caller simulates this to find a
    /// reward note, then passes the hint to claim_reward_private.
    #[external("utility")]
    unconstrained fn get_my_reward_notes(
        owner: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<HintedNote<RewardClaimNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = self.storage.reward_notes.get_storage_slot();
        let opt_notes = aztec::oracle::notes::get_notes(
            Option::some(owner),
            storage_slot,
            0,
            [], [], [], [], [], [], [], [],
            [],
            MAX_NOTES_PER_PAGE,
            page_index * MAX_NOTES_PER_PAGE,
            NoteStatus.ACTIVE,
        );
        array::collapse(opt_notes)
    }
}
