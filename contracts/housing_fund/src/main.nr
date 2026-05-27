use aztec::macros::aztec;

/// HousingFund -- the core Fair Squares protocol contract.
///
/// PUBLIC state: total deposits, total in DeFi, total allocated, pause status
/// PRIVATE state (V2 additive): per-user DepositNotes in each owner's PXE.
///
/// Flow:
///   - Legacy public deposit(amount) -- keeps the per-user deposit_tickets
///     map; used by V1 frontend paths.
///   - V2 private deposit_private(amount, hinted_kyc_note) -- proves the
///     caller holds a valid KycCredentialNote via assert_note_existed_by,
///     mints a DepositNote to the caller's PXE, enqueues an only_self
///     _record_deposit_private(amount) so the public total_deposits
///     counter is updated WITHOUT the user's address crossing the boundary.
#[aztec]
pub contract HousingFund {
    use deposit_note::DepositNote;
    use fund_token::FundToken;
    use governance::Governance;
    use kyc_verifier::{KYCVerifier, credential_note::KycCredentialNote};
    use aztec::{
        history::note::assert_note_existed_by,
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{constants::MAX_NOTES_PER_PAGE, HintedNote, note_getter_options::NoteStatus},
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::{Deserialize, Serialize, ToField},
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable, StateVariable},
        utils::array,
    };

    #[derive(Serialize, Deserialize)]
    pub struct FundStatsView {
        pub total_deposits: u64,
        pub total_in_defi: u64,
        pub total_allocated: u64,
        pub available: u64,
    }

    #[derive(Serialize, Deserialize)]
    pub struct Valuation {
        pub last_asset_sale_price: u64,
        pub last_fsft_minted: u64,
        pub last_token_price_bps: u64,
        pub last_valuation_block: u32,
    }

    #[derive(Serialize, Deserialize)]
    pub struct DistributionStatus {
        pub open: bool,
        pub amount: u64,
        pub total_deposits_snapshot: u64,
        pub claimed_total: u64,
    }

    #[derive(Serialize, Deserialize)]
    pub struct ParkedCapitalPolicy {
        pub target_bps: u32,
        pub min_bps: u32,
        pub max_bps: u32,
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        // Linked contracts
        kyc_verifier: PublicMutable<AztecAddress, Context>,
        fund_token: PublicMutable<AztecAddress, Context>,
        defi_vault: PublicMutable<AztecAddress, Context>,
        governance: PublicMutable<AztecAddress, Context>,
        // Fund accounting (all public -- transparent to investors)
        total_deposits: PublicMutable<u64, Context>,
        total_in_defi: PublicMutable<u64, Context>,
        total_allocated: PublicMutable<u64, Context>,
        // Investor deposit tickets (on-chain, later moved to private notes)
        investor_count: PublicMutable<u32, Context>,
        investor_index: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        investor_seen: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        deposit_tickets: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        // Latest valuation snapshot from executed asset sale
        last_asset_sale_price: PublicMutable<u64, Context>,
        last_fsft_minted: PublicMutable<u64, Context>,
        // EUR per FSFT in basis points (10000 = 1.0000 EUR/FSFT)
        last_token_price_bps: PublicMutable<u64, Context>,
        last_valuation_block: PublicMutable<u32, Context>,
        // Parked-capital policy for idle EUR allocations (basis points)
        parked_target_bps: PublicMutable<u32, Context>,
        parked_min_bps: PublicMutable<u32, Context>,
        parked_max_bps: PublicMutable<u32, Context>,
        // Proposal distribution snapshots
        d_open: Map<Field, PublicMutable<bool, Context>, Context>,
        d_amount: Map<Field, PublicMutable<u64, Context>, Context>,
        d_total_deposits_snapshot: Map<Field, PublicMutable<u64, Context>, Context>,
        d_claimed_total: Map<Field, PublicMutable<u64, Context>, Context>,
        d_has_claimed: Map<Field, PublicMutable<bool, Context>, Context>,
        // Emergency pause
        is_paused: PublicMutable<bool, Context>,
        // V2 private deposits: each owner's PXE holds their own DepositNote set.
        deposit_notes: Owned<PrivateSet<DepositNote, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.total_deposits.write(0);
        self.storage.total_in_defi.write(0);
        self.storage.total_allocated.write(0);
        self.storage.investor_count.write(0);
        self.storage.last_asset_sale_price.write(0);
        self.storage.last_fsft_minted.write(0);
        self.storage.last_token_price_bps.write(0);
        self.storage.last_valuation_block.write(0);
        self.storage.parked_target_bps.write(3000);
        self.storage.parked_min_bps.write(2000);
        self.storage.parked_max_bps.write(5000);
        self.storage.is_paused.write(false);
    }

    // -- Contract wiring (called after all contracts are deployed) ---------

    #[external("public")]
    fn set_contracts(
        kyc_verifier: AztecAddress,
        fund_token: AztecAddress,
        defi_vault: AztecAddress,
        governance: AztecAddress,
    ) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.kyc_verifier.write(kyc_verifier);
        self.storage.fund_token.write(fund_token);
        self.storage.defi_vault.write(defi_vault);
        self.storage.governance.write(governance);
    }

    // -- Core operations --------------------------------------------------

    #[external("public")]
    fn deposit(amount: u64) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        assert(amount > 0, "amount must be positive");
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "investor role required");

        let previous_ticket = self.storage.deposit_tickets.at(caller).read();
        if previous_ticket == 0 {
            if !self.storage.investor_seen.at(caller).read() {
                let next_index = self.storage.investor_count.read();
                self.storage.investor_index.at(next_index as Field).write(caller);
                self.storage.investor_count.write(next_index + 1);
                self.storage.investor_seen.at(caller).write(true);
            }
        }
        self.storage.deposit_tickets.at(caller).write(previous_ticket + amount);
        let updated_ticket = previous_ticket + amount;
        let governance_addr = self.storage.governance.read();
        if !governance_addr.is_zero() {
            let gov = Governance::at(governance_addr);
            self.call(gov.sync_deposit_ticket(caller, updated_ticket));
        }

        let current = self.storage.total_deposits.read();
        self.storage.total_deposits.write(current + amount);
    }

    #[external("public")]
    fn withdraw(amount: u64) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        assert(amount > 0, "amount must be positive");
        let caller = self.msg_sender();
        let ticket = self.storage.deposit_tickets.at(caller).read();
        assert(amount <= ticket, "insufficient deposit ticket");

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        let updated_ticket = ticket - amount;
        self.storage.deposit_tickets.at(caller).write(updated_ticket);
        let governance_addr = self.storage.governance.read();
        if !governance_addr.is_zero() {
            let gov = Governance::at(governance_addr);
            self.call(gov.sync_deposit_ticket(caller, updated_ticket));
        }
        self.storage.total_deposits.write(deposits - amount);
    }

    // -- DeFi management --------------------------------------------------

    #[external("public")]
    fn deploy_to_defi(amount: u64) {
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let gov = self.storage.governance.read();
        assert(admin.eq(caller) | gov.eq(caller), "not authorized");

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        self.storage.total_in_defi.write(in_defi + amount);
    }

    #[external("public")]
    fn withdraw_from_defi(amount: u64) {
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let gov = self.storage.governance.read();
        assert(admin.eq(caller) | gov.eq(caller), "not authorized");

        let in_defi = self.storage.total_in_defi.read();
        assert(amount <= in_defi, "exceeds defi balance");

        self.storage.total_in_defi.write(in_defi - amount);
    }

    #[external("public")]
    fn set_parked_capital_policy(target_bps: u32, min_bps: u32, max_bps: u32) {
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let gov = self.storage.governance.read();
        assert(admin.eq(caller) | gov.eq(caller), "not authorized");

        assert(max_bps <= 10000, "max bps out of range");
        assert(min_bps <= max_bps, "invalid min/max policy");
        assert((target_bps >= min_bps) & (target_bps <= max_bps), "target outside policy range");

        self.storage.parked_target_bps.write(target_bps);
        self.storage.parked_min_bps.write(min_bps);
        self.storage.parked_max_bps.write(max_bps);
    }

    // -- Governance: Property reservation ---------------------------------

    #[external("public")]
    fn reserve_for_property(amount: u64) {
        let caller = self.msg_sender();
        let gov = self.storage.governance.read();
        let admin = self.storage.admin.read();
        assert(gov.eq(caller) | admin.eq(caller), "only governance or admin can reserve");

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount <= available, "insufficient available balance");

        self.storage.total_allocated.write(allocated + amount);
    }

    // -- Permissionless settlement + investor claims ------------------------

    #[external("public")]
    fn open_distribution(proposal_id: u32) {
        let pid = proposal_id as Field;
        assert(!self.storage.d_open.at(pid).read(), "distribution already opened");

        let gov = Governance::at(self.storage.governance.read());
        let status = self.view(gov.get_proposal_status_public(proposal_id));
        assert(status == 3, "proposal is not executed");

        let proposal_amount = self.view(gov.get_proposal_amount_public(proposal_id));
        assert(proposal_amount > 0, "invalid proposal amount");

        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(proposal_amount <= available, "insufficient available balance");

        self.storage.total_allocated.write(allocated + proposal_amount);
        self.storage.d_open.at(pid).write(true);
        self.storage.d_amount.at(pid).write(proposal_amount);
        self.storage.d_total_deposits_snapshot.at(pid).write(deposits);
        self.storage.d_claimed_total.at(pid).write(0);

        // Issue-time pricing snapshot: used as reference, not hard peg.
        self.storage.last_asset_sale_price.write(proposal_amount);
        self.storage.last_fsft_minted.write(proposal_amount);
        self.storage.last_token_price_bps.write(10000);
        self.storage.last_valuation_block.write(self.context.block_number());
    }

    #[external("public")]
    fn claim_distribution(proposal_id: u32) {
        let pid = proposal_id as Field;
        assert(self.storage.d_open.at(pid).read(), "distribution is not open");

        let caller = self.msg_sender();
        let claim_key = poseidon2_hash([caller.to_field(), pid]);
        assert(!self.storage.d_has_claimed.at(claim_key).read(), "already claimed");

        let snapshot_total = self.storage.d_total_deposits_snapshot.at(pid).read();
        assert(snapshot_total > 0, "invalid distribution snapshot");

        let ticket = self.storage.deposit_tickets.at(caller).read();
        assert(ticket > 0, "no deposit ticket");

        let distribution_amount = self.storage.d_amount.at(pid).read();
        let raw_claim = (distribution_amount * ticket) / snapshot_total;
        assert(raw_claim > 0, "claim amount is zero");

        let claimed_total = self.storage.d_claimed_total.at(pid).read();
        assert(claimed_total < distribution_amount, "distribution exhausted");

        let remaining = distribution_amount - claimed_total;
        let claim_amount = if raw_claim > remaining { remaining } else { raw_claim };
        assert(claim_amount > 0, "nothing left to claim");

        let fund_token = FundToken::at(self.storage.fund_token.read());
        self.call(fund_token.mint_public(caller, claim_amount));

        self.storage.d_claimed_total.at(pid).write(claimed_total + claim_amount);
        self.storage.d_has_claimed.at(claim_key).write(true);
    }

    // -- Governance/accounting: valuation snapshot ------------------------
    // Called after an executed proposal and FSFT distribution.
    #[external("public")]
    fn record_asset_sale(asset_sale_price: u64, minted_fsft: u64) {
        let caller = self.msg_sender();
        let gov = self.storage.governance.read();
        let admin = self.storage.admin.read();
        assert(gov.eq(caller) | admin.eq(caller), "not authorized");
        assert(asset_sale_price > 0, "asset sale price must be positive");
        assert(minted_fsft > 0, "minted fsft must be positive");

        let token_price_bps = (asset_sale_price * 10000) / minted_fsft;
        self.storage.last_asset_sale_price.write(asset_sale_price);
        self.storage.last_fsft_minted.write(minted_fsft);
        self.storage.last_token_price_bps.write(token_price_bps);
        self.storage.last_valuation_block.write(self.context.block_number());
    }

    // -- V2: private deposit ---------------------------------------------------
    // The caller passes a hinted KycCredentialNote that they own; we prove it
    // existed in KYCVerifier's note set at a recent anchor block. The deposit
    // itself is stored privately as a DepositNote in the caller's set; only
    // the aggregate total_deposits counter is updated publicly (via an
    // only_self enqueue so the caller's address does not cross into public).

    #[external("private")]
    fn deposit_private(amount: u128, hinted_kyc_note: HintedNote<KycCredentialNote>) {
        assert(amount > 0, "amount must be positive");

        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_kyc_note);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "kyc note not owned by caller");
        assert(confirmed.note.owner == caller, "kyc note owner mismatch");

        // Mint a DepositNote into the caller's own PrivateSet.
        let note = DepositNote::new(caller, amount);
        self.storage.deposit_notes.at(caller).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Compute the credential's revocation commitment from the note's
        // packed fields so the public tail can reject revoked credentials.
        // poseidon2([owner, nonce]) matches KYCVerifier.compute_revocation_commitment.
        let credential_commitment = poseidon2_hash([
            confirmed.note.owner.to_field(),
            confirmed.note.nonce,
        ]);

        // Bump the public aggregate + verify (a) the credential came from our
        // configured KYCVerifier contract and (b) it has not been revoked.
        // Args carry only the amount, the note's source contract, and the
        // revocation commitment; the caller's address never crosses the
        // private/public boundary.
        self.enqueue_self._record_deposit_private(
            amount,
            confirmed.contract_address,
            credential_commitment,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_deposit_private(
        amount: u128,
        kyc_note_contract: AztecAddress,
        credential_commitment: Field,
    ) {
        let kyc_addr = self.storage.kyc_verifier.read();
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        let amount_u64 = amount as u64;
        let total = self.storage.total_deposits.read();
        self.storage.total_deposits.write(total + amount_u64);
    }

    // -- Emergency controls -----------------------------------------------

    #[external("public")]
    fn pause() {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.is_paused.write(true);
    }

    #[external("public")]
    fn unpause() {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.is_paused.write(false);
    }

    // -- View functions ---------------------------------------------------

    #[external("utility")]
    unconstrained fn get_total_deposits() -> pub u64 {
        self.storage.total_deposits.read()
    }

    #[external("utility")]
    unconstrained fn get_user_deposit_ticket(user: AztecAddress) -> pub u64 {
        self.storage.deposit_tickets.at(user).read()
    }

    #[external("utility")]
    unconstrained fn get_investor_count() -> pub u32 {
        self.storage.investor_count.read()
    }

    #[external("utility")]
    unconstrained fn get_investor_at(index: u32) -> pub AztecAddress {
        self.storage.investor_index.at(index as Field).read()
    }

    #[external("utility")]
    unconstrained fn get_fund_stats() -> pub FundStatsView {
        let total = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = total - in_defi - allocated;
        FundStatsView {
            total_deposits: total,
            total_in_defi: in_defi,
            total_allocated: allocated,
            available,
        }
    }

    #[external("utility")]
    unconstrained fn get_valuation() -> pub Valuation {
        Valuation {
            last_asset_sale_price: self.storage.last_asset_sale_price.read(),
            last_fsft_minted: self.storage.last_fsft_minted.read(),
            last_token_price_bps: self.storage.last_token_price_bps.read(),
            last_valuation_block: self.storage.last_valuation_block.read(),
        }
    }

    #[external("public")]
    #[view]
    fn get_valuation_public() -> pub Valuation {
        Valuation {
            last_asset_sale_price: self.storage.last_asset_sale_price.read(),
            last_fsft_minted: self.storage.last_fsft_minted.read(),
            last_token_price_bps: self.storage.last_token_price_bps.read(),
            last_valuation_block: self.storage.last_valuation_block.read(),
        }
    }

    #[external("utility")]
    unconstrained fn get_claimable_amount(proposal_id: u32, user: AztecAddress) -> pub u64 {
        let pid = proposal_id as Field;
        let claim_key = poseidon2_hash([user.to_field(), pid]);
        let is_open = self.storage.d_open.at(pid).read();
        let has_claimed = self.storage.d_has_claimed.at(claim_key).read();
        let snapshot_total = self.storage.d_total_deposits_snapshot.at(pid).read();
        let ticket = self.storage.deposit_tickets.at(user).read();
        let distribution_amount = self.storage.d_amount.at(pid).read();
        let claimed_total = self.storage.d_claimed_total.at(pid).read();

        if !is_open | has_claimed | (snapshot_total == 0) | (ticket == 0) | (claimed_total >= distribution_amount) {
            0
        } else {
            let raw_claim = (distribution_amount * ticket) / snapshot_total;
            let remaining = distribution_amount - claimed_total;
            if raw_claim > remaining { remaining } else { raw_claim }
        }
    }

    #[external("utility")]
    unconstrained fn has_claimed(proposal_id: u32, user: AztecAddress) -> pub bool {
        let pid = proposal_id as Field;
        let claim_key = poseidon2_hash([user.to_field(), pid]);
        self.storage.d_has_claimed.at(claim_key).read()
    }

    #[external("utility")]
    unconstrained fn get_distribution_status(proposal_id: u32) -> pub DistributionStatus {
        let pid = proposal_id as Field;
        DistributionStatus {
            open: self.storage.d_open.at(pid).read(),
            amount: self.storage.d_amount.at(pid).read(),
            total_deposits_snapshot: self.storage.d_total_deposits_snapshot.at(pid).read(),
            claimed_total: self.storage.d_claimed_total.at(pid).read(),
        }
    }

    #[external("utility")]
    unconstrained fn is_paused() -> pub bool {
        self.storage.is_paused.read()
    }

    #[external("utility")]
    unconstrained fn get_parked_capital_policy() -> pub ParkedCapitalPolicy {
        ParkedCapitalPolicy {
            target_bps: self.storage.parked_target_bps.read(),
            min_bps: self.storage.parked_min_bps.read(),
            max_bps: self.storage.parked_max_bps.read(),
        }
    }

    #[external("utility")]
    unconstrained fn get_admin() -> pub AztecAddress {
        self.storage.admin.read()
    }

    /// PXE-side helper: fetch caller's DepositNotes as paged HintedNote vec.
    /// Used by V2 callers (e.g., Governance.cast_vote_private's
    /// fund-exposure proof, frontend portfolio sum) via
    /// .simulate({ from: owner }). Pattern matches
    /// crowdfunding_contract.get_donation_notes.
    #[external("utility")]
    unconstrained fn get_my_deposit_notes(
        owner: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<HintedNote<DepositNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = self.storage.deposit_notes.get_storage_slot();
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
