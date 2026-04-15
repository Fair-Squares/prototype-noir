use aztec::macros::aztec;

/// ProtocolRewards -- 10-year protocol token distribution controller.
///
/// The contract stores epoch checkpoints and per-user weighted allocations.
/// Claimable rewards roll forward until claimed.
#[aztec]
pub contract ProtocolRewards {
    use fund_token::FundToken;
    use kyc_verifier::KYCVerifier;
    use aztec::{
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::ToField,
        },
        state_vars::{Map, PublicMutable},
    };
    use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_honk_proof};

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

        fsft_rewards_attested: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        rewards_weights_vk_hash: PublicMutable<Field, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        admin: AztecAddress,
        protocol_token: AztecAddress,
        fsft_token: AztecAddress,
        housing_fund: AztecAddress,
        governance: AztecAddress,
        kyc_verifier: AztecAddress,
        claim_min: u64,
    ) {
        assert(!admin.is_zero(), "invalid admin");
        assert(!protocol_token.is_zero(), "invalid protocol token");
        assert(!fsft_token.is_zero(), "invalid fsft token");
        assert(!housing_fund.is_zero(), "invalid housing fund");
        assert(!governance.is_zero(), "invalid governance");
        assert(!kyc_verifier.is_zero(), "invalid kyc verifier");
        assert(claim_min > 0, "invalid claim min");

        self.storage.admin.write(admin);
        self.storage.protocol_token.write(protocol_token);
        self.storage.fsft_token.write(fsft_token);
        self.storage.housing_fund.write(housing_fund);
        self.storage.governance.write(governance);
        self.storage.kyc_verifier.write(kyc_verifier);

        self.storage.total_distribution_pool.write(8_000_000);
        self.storage.total_distributed.write(0);
        self.storage.total_claimed.write(0);

        self.storage.claim_min.write(claim_min);
        self.storage.total_epochs.write(120);
        self.storage.current_epoch.write(0);
        self.storage.rewards_weights_vk_hash.write(0 as Field);
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

    #[external("public")]
    fn set_rewards_weights_vk_hash(vk_hash: Field) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.rewards_weights_vk_hash.write(vk_hash);
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

        let fsft = FundToken::at(self.storage.fsft_token.read());
        let public_balance = self.view(fsft.public_balance_of_public(user));
        let private_holder_proof = self.view(fsft.has_private_holder_proof(user));
        let attested = self.storage.fsft_rewards_attested.at(user).read();
        let fsft_eligible = (public_balance > 0) | private_holder_proof | attested;

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

    /// Proof-backed variant of user epoch weighting.
    /// public_inputs schema:
    /// [0]=user, [1]=epoch, [2]=deposit_weight, [3]=fsft_weight, [4]=vote_weight
    #[external("private")]
    fn set_user_epoch_weights_recursive(
        epoch: u32,
        user: AztecAddress,
        deposit_weight: u64,
        fsft_weight: u64,
        vote_weight: u64,
        vk_hash: Field,
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        public_inputs: [Field; 5],
    ) {
        let caller = self.msg_sender();
        assert(!user.is_zero(), "invalid user");

        verify_honk_proof(verification_key, proof, public_inputs, vk_hash);

        assert(public_inputs[0] == user.to_field(), "proof user mismatch");
        assert(public_inputs[1] == epoch as Field, "proof epoch mismatch");
        assert(public_inputs[2] == deposit_weight as Field, "proof deposit weight mismatch");
        assert(public_inputs[3] == fsft_weight as Field, "proof fsft weight mismatch");
        assert(public_inputs[4] == vote_weight as Field, "proof governance weight mismatch");

        self.enqueue_self._set_user_epoch_weights_recursive_public(
            caller,
            epoch,
            user,
            deposit_weight,
            fsft_weight,
            vote_weight,
            vk_hash,
        );
    }

    #[external("public")]
    #[only_self]
    fn _set_user_epoch_weights_recursive_public(
        caller: AztecAddress,
        epoch: u32,
        user: AztecAddress,
        deposit_weight: u64,
        fsft_weight: u64,
        vote_weight: u64,
        vk_hash: Field,
    ) {
        assert_eq(caller, self.storage.admin.read(), "not admin");
        assert(!user.is_zero(), "invalid user");

        let configured_vk_hash = self.storage.rewards_weights_vk_hash.read();
        assert(configured_vk_hash != 0 as Field, "rewards vk hash not configured");
        assert(vk_hash == configured_vk_hash, "rewards vk hash mismatch");

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

        let fsft = FundToken::at(self.storage.fsft_token.read());
        let public_balance = self.view(fsft.public_balance_of_public(user));
        let private_holder_proof = self.view(fsft.has_private_holder_proof(user));
        let attested = self.storage.fsft_rewards_attested.at(user).read();
        let fsft_eligible = (public_balance > 0) | private_holder_proof | attested;

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

    #[external("public")]
    fn attest_private_fsft_for_rewards() {
        let caller = self.msg_sender();
        let kyc = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc.is_investor(caller));
        assert(is_investor, "investor role required");

        let fsft = FundToken::at(self.storage.fsft_token.read());
        let public_balance = self.view(fsft.public_balance_of_public(caller));
        let private_holder_proof = self.view(fsft.has_private_holder_proof(caller));

        assert((public_balance > 0) | private_holder_proof, "no fsft exposure to attest");
        self.storage.fsft_rewards_attested.at(caller).write(true);
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

        let protocol_token = FundToken::at(self.storage.protocol_token.read());
        self.call(protocol_token.mint_public(caller, claimable));

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
    fn get_user_stats(user: AztecAddress) -> pub (u64, u64, u32, bool) {
        (
            self.storage.user_claimable.at(user).read(),
            self.storage.user_total_claimed.at(user).read(),
            self.storage.user_last_claimed_epoch.at(user).read(),
            self.storage.fsft_rewards_attested.at(user).read(),
        )
    }

    #[external("public")]
    #[view]
    fn get_epoch_stats(epoch: u32) -> pub (bool, u64, u64, u64, u64, u64) {
        let eid = epoch as Field;
        (
            self.storage.epoch_open.at(eid).read(),
            self.storage.epoch_emission.at(eid).read(),
            self.storage.epoch_deposit_total_weight.at(eid).read(),
            self.storage.epoch_fsft_total_weight.at(eid).read(),
            self.storage.epoch_vote_total_weight.at(eid).read(),
            self.storage.epoch_allocated.at(eid).read(),
        )
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
    fn get_rewards_config() -> pub (u64, u64, u64, u32, u32, u64) {
        (
            self.storage.total_distribution_pool.read(),
            self.storage.total_distributed.read(),
            self.storage.total_claimed.read(),
            self.storage.current_epoch.read(),
            self.storage.total_epochs.read(),
            self.storage.claim_min.read(),
        )
    }

    #[external("public")]
    #[view]
    fn has_fsft_rewards_eligibility(user: AztecAddress) -> pub bool {
        let fsft = FundToken::at(self.storage.fsft_token.read());
        let public_balance = self.view(fsft.public_balance_of_public(user));
        let private_holder_proof = self.view(fsft.has_private_holder_proof(user));
        let attested = self.storage.fsft_rewards_attested.at(user).read();

        (public_balance > 0) | private_holder_proof | attested
    }

    #[external("public")]
    #[view]
    fn get_rewards_weights_vk_hash() -> pub Field {
        self.storage.rewards_weights_vk_hash.read()
    }
}
