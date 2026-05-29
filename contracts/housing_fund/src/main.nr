mod test;

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
    use nft_contract::NFT;
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
        // AIP-721 property-deed NFT (this fund is its minter). Optional: when
        // unset, distribution still works and no deed is minted.
        property_nft: PublicMutable<AztecAddress, Context>,
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
        // V2 nullifiers per (poseidon2_hash([note_hash, proposal_id]), owner)
        // for claim_distribution_private -- caller can claim once per
        // (deposit_note, proposal) pair.
        d_claim_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
        // V2 nullifiers per (note_hash, owner) for withdraw_private -- after
        // a withdraw the note is permanently consumed.
        w_withdraw_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
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

    // Wire the AIP-721 property-deed NFT (deployed with this fund as its minter).
    // Kept separate from set_contracts to avoid changing that function's arity.
    #[external("public")]
    fn set_property_nft(property_nft: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.property_nft.write(property_nft);
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

        // Record the asset acquisition on-chain by minting a property-deed NFT
        // (AIP-721) to the fund. token_id = proposal_id + 1 because the NFT
        // contract reserves token_id 0. No-op if the NFT is not wired up.
        let nft_addr = self.storage.property_nft.read();
        if !nft_addr.is_zero() {
            let recipient = self.context.this_address();
            let token_id: Field = (proposal_id + 1) as Field;
            let nft = NFT::at(nft_addr);
            self.call(nft.mint_to_public(recipient, token_id));
        }
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

    // -- V2: private withdraw -------------------------------------------------
    //
    // Caller passes a hinted DepositNote they own. We verify ownership +
    // origin contract, consume a per-(note_hash, owner) SingleUseClaim
    // nullifier so the same note cannot be withdrawn twice, then enqueue
    // an only_self decrement of the public total_deposits aggregate.
    // The note's amount never crosses the private/public boundary except
    // as a delta on the aggregate counter.
    //
    // This withdraws the ENTIRE note's amount. Partial withdraws are a
    // follow-up that would need pop_notes-style change-note minting.

    #[external("private")]
    fn withdraw_private(hinted_deposit: HintedNote<DepositNote>) {
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_deposit);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "deposit note not owned by caller");
        assert(confirmed.note.owner == caller, "deposit note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "deposit note from wrong contract",
        );

        let note_hash = compute_confirmed_note_hash_for_nullification(confirmed);
        self.storage.w_withdraw_nullifiers.at(note_hash).at(caller).claim();

        self.enqueue_self._record_withdraw_private(confirmed.note.amount);
    }

    #[external("public")]
    #[only_self]
    fn _record_withdraw_private(amount: u128) {
        let amount_u64 = amount as u64;
        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = deposits - in_defi - allocated;
        assert(amount_u64 <= available, "insufficient available balance");
        self.storage.total_deposits.write(deposits - amount_u64);
    }

    // -- V2: private claim_distribution ---------------------------------------
    //
    // Caller passes a hinted DepositNote and the FundToken (FSFT) address.
    // We prove the note existed at a recent anchor block (so it must have
    // existed at or before distribution-open), consume a per-(note_hash,
    // proposal_id, owner) nullifier so the same note cannot claim the same
    // distribution twice, compute the caller's share privately, and mint
    // FSFT to caller via a private->private cross-contract mint. The
    // caller's address never crosses the private/public boundary except
    // as the recipient of the private mint (which stays in their PXE).
    //
    // The caller supplies the public distribution params (distribution
    // amount + snapshot total); the public tail verifies they match the
    // stored values so a malicious caller cannot inflate their share.

    #[external("private")]
    fn claim_distribution_private(
        proposal_id: u32,
        hinted_deposit: HintedNote<DepositNote>,
        fund_token_addr: AztecAddress,
        supplied_distribution_amount: u64,
        supplied_snapshot_total: u64,
    ) {
        assert(supplied_snapshot_total > 0, "invalid snapshot total");

        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_deposit);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "deposit note not owned by caller");
        assert(confirmed.note.owner == caller, "deposit note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "deposit note from wrong contract",
        );

        // Per-(note_hash, proposal_id, owner) nullifier so the same note
        // can claim across DIFFERENT proposals (one share per distribution)
        // but not the same proposal twice.
        let note_hash = compute_confirmed_note_hash_for_nullification(confirmed);
        let pid = proposal_id as Field;
        let claim_key = poseidon2_hash([note_hash, pid]);
        self.storage.d_claim_nullifiers.at(claim_key).at(caller).claim();

        // Share = (distribution_amount * note.amount) / snapshot_total.
        // note.amount is kernel-verified; supplied_* are caller-supplied
        // and verified in the public tail.
        let raw_share =
            (supplied_distribution_amount as u128 * confirmed.note.amount)
                / supplied_snapshot_total as u128;
        assert(raw_share > 0, "share is zero");
        let share_u64 = raw_share as u64;

        // Private mint to caller. FundToken.mint_private is admin-only;
        // bootstrap transferred fund_token admin to this contract, so
        // when we call it the token sees msg_sender = HousingFund.
        self.call(FundToken::at(fund_token_addr).mint_private(caller, share_u64));

        // Public tail: verify caller-supplied params and that
        // fund_token_addr matches our configured fund_token storage;
        // bump d_claimed_total.
        self.enqueue_self._record_distribution_claim(
            proposal_id,
            share_u64,
            fund_token_addr,
            supplied_distribution_amount,
            supplied_snapshot_total,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_distribution_claim(
        proposal_id: u32,
        share: u64,
        supplied_fund_token: AztecAddress,
        supplied_distribution_amount: u64,
        supplied_snapshot_total: u64,
    ) {
        let pid = proposal_id as Field;
        assert(self.storage.d_open.at(pid).read(), "distribution not open");
        assert(
            supplied_fund_token == self.storage.fund_token.read(),
            "fund token mismatch",
        );
        assert(
            supplied_distribution_amount == self.storage.d_amount.at(pid).read(),
            "distribution amount mismatch",
        );
        assert(
            supplied_snapshot_total == self.storage.d_total_deposits_snapshot.at(pid).read(),
            "snapshot total mismatch",
        );

        let claimed_total = self.storage.d_claimed_total.at(pid).read();
        assert(claimed_total + share <= supplied_distribution_amount, "distribution exhausted");
        self.storage.d_claimed_total.at(pid).write(claimed_total + share);
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
