mod test;

use aztec::macros::aztec;

/// HousingFund -- the core Fair Squares protocol contract.
///
/// PUBLIC state: total deposits, total in DeFi, total allocated, pause status,
/// and the FIFO/allocation cursors (cum_deposits, cum_small_deposits,
/// deposit_seq) + per-deposit public records.
/// PRIVATE state (V2): per-user DepositNotes in each owner's PXE, each carrying
/// its immutable FIFO interval (cum_before), global seq, and frozen is_small bit.
///
/// Phase 3: FSFT is the vendored AIP-20 `Token` (this fund is its immutable
/// minter). FSFT is minted only when a property is voted in (executed proposal)
/// and the distribution is claimed, allocated by a FIFO + small-depositor-floor
/// scheme rather than flat pro-rata:
///   - small_pool = 30% of the pool, pro-rata among small depositors
///     (amount <= small_threshold), and
///   - fifo_pool = 70% of the pool, filled earliest-deposit-first (1:1 over the
///     deposit's FIFO interval [cum_before, cum_before+amount)) until exhausted.
/// Each claimant's share is an order-independent pure function of their own
/// immutable deposit data + the per-proposal snapshots, so permissionless
/// arbitrary-order claims can never over-mint (Sum of claims <= pool).
///
/// Privacy note: a private deposit's public tail leaks (a) its exact amount as
/// the cum_deposits aggregate delta -- which already leaked pre-Phase-3 -- and
/// (b) ONE bit (small vs large) via whether cum_small_deposits moves. The
/// caller's address never crosses the private/public boundary. This one-bit
/// aggregate leak is an accepted trade-off for the prototype.
#[aztec]
pub contract HousingFund {
    use deposit_note::DepositNote;
    use token_contract::Token;
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
            traits::{Deserialize, Packable, Serialize, ToField},
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable, SingleUseClaim, StateVariable},
        utils::array,
    };

    // Default "small depositor" cutoff (in whole EUR units). Configurable by admin.
    global DEFAULT_SMALL_THRESHOLD: u128 = 10000;
    // Allocation split: 30% reserved for the small-depositor pool, 70% FIFO.
    global SMALL_POOL_BPS: u128 = 3000;

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

    // Per-proposal distribution snapshot, all in u128 FSFT units.
    #[derive(Serialize, Deserialize)]
    pub struct DistributionStatus {
        pub open: bool,
        pub amount: u128,
        pub snapshot_total: u128,
        pub small_total: u128,
        pub small_pool: u128,
        pub fifo_cap: u128,
        pub claimed_total: u128,
    }

    // The public deposit/allocation cursors a PXE caller must read to supply the
    // stamping params for a private deposit (supplied-then-verified).
    #[derive(Serialize, Deserialize)]
    pub struct DepositCursor {
        pub cum_deposits: u128,
        pub cum_small_deposits: u128,
        pub deposit_seq: u64,
        pub small_threshold: u128,
    }

    // Public-path per-deposit record (the FIFO claim basis on the public path).
    #[derive(Serialize, Deserialize, Packable, Eq)]
    pub struct DepositRecord {
        pub owner: AztecAddress,
        pub amount: u128,
        pub cum_before: u128,
        pub is_small: bool,
    }

    // A user-facing view of one public deposit record (with its global seq).
    #[derive(Serialize, Deserialize)]
    pub struct DepositRecordView {
        pub seq: u64,
        pub amount: u128,
        pub cum_before: u128,
        pub is_small: bool,
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
        // Fund accounting (all public -- transparent to investors). total_deposits
        // is NET of withdrawals and bounds available balance.
        total_deposits: PublicMutable<u64, Context>,
        total_in_defi: PublicMutable<u64, Context>,
        total_allocated: PublicMutable<u64, Context>,
        // FIFO / allocation cursors (gross, monotonic, u128, NEVER decremented).
        // cum_deposits gives every deposit its immutable FIFO interval; the
        // small/threshold cursor feeds the small-pool denominator.
        small_threshold: PublicMutable<u128, Context>,
        cum_deposits: PublicMutable<u128, Context>,
        cum_small_deposits: PublicMutable<u128, Context>,
        deposit_seq: PublicMutable<u64, Context>,
        // Public-path per-deposit records, keyed poseidon2([owner, seq]).
        deposit_records: Map<Field, PublicMutable<DepositRecord, Context>, Context>,
        // Per-user enumeration of public deposit seqs so a caller can list their
        // claimable records: count + indexed seq map keyed poseidon2([owner, idx]).
        user_deposit_count: Map<AztecAddress, PublicMutable<u32, Context>, Context>,
        user_deposit_seq: Map<Field, PublicMutable<u64, Context>, Context>,
        // Investor deposit tickets (aggregate; used for legacy public withdraw).
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
        // Per-proposal distribution snapshots (all u128 FSFT units).
        d_open: Map<Field, PublicMutable<bool, Context>, Context>,
        d_amount: Map<Field, PublicMutable<u128, Context>, Context>,
        d_snapshot_total: Map<Field, PublicMutable<u128, Context>, Context>,
        d_small_total: Map<Field, PublicMutable<u128, Context>, Context>,
        d_small_pool: Map<Field, PublicMutable<u128, Context>, Context>,
        d_fifo_cap: Map<Field, PublicMutable<u128, Context>, Context>,
        d_claimed_total: Map<Field, PublicMutable<u128, Context>, Context>,
        // Structural undistributable dust at open (audit; fifo under-subscription
        // + the whole small_pool when there are no small depositors).
        d_dust: Map<Field, PublicMutable<u128, Context>, Context>,
        // Public-path anti-double-claim, keyed poseidon2([owner, seq, proposal_id]).
        d_record_has_claimed: Map<Field, PublicMutable<bool, Context>, Context>,
        // Emergency pause
        is_paused: PublicMutable<bool, Context>,
        // V2 private deposits: each owner's PXE holds their own DepositNote set.
        deposit_notes: Owned<PrivateSet<DepositNote, Context>, Context>,
        // V2 nullifiers per (poseidon2_hash([note_hash, proposal_id]), owner)
        // for claim_distribution_private -- claim once per (deposit_note, proposal).
        d_claim_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
        // V2 nullifiers per (note_hash, owner) for withdraw_private.
        w_withdraw_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
    }

    // ====================================================================
    // Allocation math -- one shared, order-independent, integer-exact set of
    // pure functions used identically by the public and private claim paths.
    // ====================================================================

    // FIFO share: the 1:1 overlap of this deposit's interval [cum_before,
    // cum_before+amount) with the FIFO window [0, fifo_cap). No division -> exact.
    #[contract_library_method]
    fn fifo_share(cum_before: u128, amount: u128, fifo_cap: u128) -> u128 {
        let hi = cum_before + amount;
        if cum_before >= fifo_cap {
            0
        } else {
            let capped_hi = if hi < fifo_cap { hi } else { fifo_cap };
            capped_hi - cum_before
        }
    }

    // Small-pool share: pro-rata among small depositors. Floors down; guarded
    // against an empty small population (no div-by-zero, no share).
    #[contract_library_method]
    fn small_share(amount: u128, is_small: bool, small_pool: u128, small_total: u128) -> u128 {
        if !is_small | (small_total == 0) {
            0
        } else {
            (small_pool * amount) / small_total
        }
    }

    // A small early depositor earns BOTH the floor and the FIFO share.
    #[contract_library_method]
    fn total_claim(
        amount: u128,
        cum_before: u128,
        is_small: bool,
        small_pool: u128,
        small_total: u128,
        fifo_cap: u128,
    ) -> u128 {
        fifo_share(cum_before, amount, fifo_cap)
            + small_share(amount, is_small, small_pool, small_total)
    }

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        self.storage.admin.write(admin);
        self.storage.total_deposits.write(0);
        self.storage.total_in_defi.write(0);
        self.storage.total_allocated.write(0);
        self.storage.small_threshold.write(DEFAULT_SMALL_THRESHOLD);
        self.storage.cum_deposits.write(0);
        self.storage.cum_small_deposits.write(0);
        self.storage.deposit_seq.write(0);
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

    // Admin-only: adjust the small-depositor cutoff. Only affects FUTURE
    // deposits -- each deposit's is_small bit is frozen at deposit time.
    #[external("public")]
    fn set_small_threshold(threshold: u128) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.small_threshold.write(threshold);
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

        let amount_u128 = amount as u128;

        // Stamp the deposit's immutable FIFO interval + frozen small bit, and
        // write a per-deposit public record (the claim basis for the public path).
        let cum_before = self.storage.cum_deposits.read();
        let seq = self.storage.deposit_seq.read();
        let threshold = self.storage.small_threshold.read();
        let is_small = amount_u128 <= threshold;

        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        self.storage.deposit_records.at(rec_key).write(DepositRecord {
            owner: caller,
            amount: amount_u128,
            cum_before,
            is_small,
        });

        // Per-user enumeration so a caller can list their public records.
        let dcount = self.storage.user_deposit_count.at(caller).read();
        self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), dcount as Field])).write(
            seq,
        );
        self.storage.user_deposit_count.at(caller).write(dcount + 1);

        // Advance the global cursors.
        self.storage.cum_deposits.write(cum_before + amount_u128);
        if is_small {
            self.storage.cum_small_deposits.write(
                self.storage.cum_small_deposits.read() + amount_u128,
            );
        }
        self.storage.deposit_seq.write(seq + 1);

        // Legacy aggregate ticket + investor registry (used by public withdraw).
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
        // NOTE: cum_deposits is monotonic (FIFO axis) and is NOT rolled back on
        // withdraw; nor are the public deposit_records retracted. A public
        // depositor who withdraws can still hold claim records for the FIFO
        // position they originally took -- a known prototype limitation of the
        // legacy public path. The canonical privacy path nullifies the note.
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

        // Distribution snapshot. proposal_amount is u64, so pool fits u64 (no
        // overflow guard needed); all allocation math is u128.
        let pool = proposal_amount as u128;
        let snapshot_total = self.storage.cum_deposits.read();
        assert(snapshot_total > 0, "no deposits to distribute");
        let small_total = self.storage.cum_small_deposits.read();
        let small_pool = (pool * SMALL_POOL_BPS) / 10000;
        let fifo_pool = pool - small_pool;
        let fifo_cap = fifo_pool;

        // Structural dust (audit): FIFO under-subscription + whole small_pool if
        // there are no small depositors.
        let fifo_filled = if snapshot_total < fifo_cap { snapshot_total } else { fifo_cap };
        let fifo_dust = fifo_cap - fifo_filled;
        let small_dust_max = if small_total == 0 { small_pool } else { 0 };

        self.storage.d_open.at(pid).write(true);
        self.storage.d_amount.at(pid).write(pool);
        self.storage.d_snapshot_total.at(pid).write(snapshot_total);
        self.storage.d_small_total.at(pid).write(small_total);
        self.storage.d_small_pool.at(pid).write(small_pool);
        self.storage.d_fifo_cap.at(pid).write(fifo_cap);
        self.storage.d_claimed_total.at(pid).write(0);
        self.storage.d_dust.at(pid).write(fifo_dust + small_dust_max);

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

    // Public claim for a SPECIFIC deposit record (identified by its global seq).
    // A multi-deposit public investor claims once per (seq, proposal).
    #[external("public")]
    fn claim_distribution(proposal_id: u32, seq: u64) {
        let pid = proposal_id as Field;
        assert(self.storage.d_open.at(pid).read(), "distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        let claim_key = poseidon2_hash([caller.to_field(), seq as Field, pid]);
        assert(!self.storage.d_record_has_claimed.at(claim_key).read(), "already claimed");

        let small_pool = self.storage.d_small_pool.at(pid).read();
        let small_total = self.storage.d_small_total.at(pid).read();
        let fifo_cap = self.storage.d_fifo_cap.at(pid).read();
        let claim = total_claim(rec.amount, rec.cum_before, rec.is_small, small_pool, small_total, fifo_cap);
        assert(claim > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        let claimed_total = self.storage.d_claimed_total.at(pid).read();
        let pool = self.storage.d_amount.at(pid).read();
        assert(claimed_total + claim <= pool, "distribution exhausted");

        let fund_token = Token::at(self.storage.fund_token.read());
        self.call(fund_token.mint_to_public(caller, claim));

        self.storage.d_claimed_total.at(pid).write(claimed_total + claim);
        self.storage.d_record_has_claimed.at(claim_key).write(true);
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
    // The caller passes a hinted KycCredentialNote that they own, plus the
    // current public allocation cursor values (read via get_deposit_cursor).
    // The DepositNote is stamped privately with those cursor values; the
    // only_self tail equality-asserts them against the live public cursors (so
    // a lie or a concurrent-deposit reorder reverts the whole tx) and advances
    // the cursors. The caller's address never crosses into public.

    #[external("private")]
    fn deposit_private(
        amount: u128,
        hinted_kyc_note: HintedNote<KycCredentialNote>,
        supplied_cum_before: u128,
        supplied_seq: u64,
        supplied_is_small: bool,
    ) {
        assert(amount > 0, "amount must be positive");

        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_kyc_note);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "kyc note not owned by caller");
        assert(confirmed.note.owner == caller, "kyc note owner mismatch");

        // Mint a DepositNote into the caller's own PrivateSet, stamped with its
        // immutable FIFO interval, global seq, and frozen small bit.
        let note = DepositNote::new(
            caller,
            amount,
            supplied_cum_before,
            supplied_seq,
            supplied_is_small,
        );
        self.storage.deposit_notes.at(caller).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Compute the credential's revocation commitment from the note's packed
        // fields so the public tail can reject revoked credentials.
        let credential_commitment = poseidon2_hash([
            confirmed.note.owner.to_field(),
            confirmed.note.nonce,
        ]);

        self.enqueue_self._record_deposit_private(
            amount,
            confirmed.contract_address,
            credential_commitment,
            supplied_cum_before,
            supplied_seq,
            supplied_is_small,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_deposit_private(
        amount: u128,
        kyc_note_contract: AztecAddress,
        credential_commitment: Field,
        supplied_cum_before: u128,
        supplied_seq: u64,
        supplied_is_small: bool,
    ) {
        let kyc_addr = self.storage.kyc_verifier.read();
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        // Verify the supplied cursor matches the live public cursor (no lie, no
        // concurrent-deposit reorder), and that the supplied small bit matches
        // the recomputed classification from the kernel-verified amount.
        let cum_before = self.storage.cum_deposits.read();
        let seq = self.storage.deposit_seq.read();
        let threshold = self.storage.small_threshold.read();
        assert(supplied_cum_before == cum_before, "stale cum_before");
        assert(supplied_seq == seq, "stale seq");
        assert(supplied_is_small == (amount <= threshold), "is_small mismatch");

        // Advance the global cursors.
        self.storage.cum_deposits.write(cum_before + amount);
        if supplied_is_small {
            self.storage.cum_small_deposits.write(
                self.storage.cum_small_deposits.read() + amount,
            );
        }
        self.storage.deposit_seq.write(seq + 1);

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
        // cum_deposits is NOT decremented (monotonic FIFO axis); the nullified
        // note can no longer prove existence, so it is ineligible to claim.
    }

    // -- V2: private claim_distribution ---------------------------------------
    //
    // Caller passes a hinted DepositNote and the FundToken (FSFT) address, plus
    // the per-proposal allocation snapshots (small_pool, small_total, fifo_cap)
    // read via get_distribution_status. The claimant's (amount, cum_before,
    // is_small) come from the KERNEL-VERIFIED note (unforgeable); the three
    // snapshots are caller-supplied and re-checked against stored values in the
    // public tail so a malicious caller cannot inflate their share. The share
    // is computed by the SAME total_claim() used by the public path. FSFT is
    // minted private->private to the caller (HousingFund is FSFT's minter).

    #[external("private")]
    fn claim_distribution_private(
        proposal_id: u32,
        hinted_deposit: HintedNote<DepositNote>,
        fund_token_addr: AztecAddress,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
    ) {
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_deposit);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "deposit note not owned by caller");
        assert(confirmed.note.owner == caller, "deposit note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "deposit note from wrong contract",
        );

        // Per-(note_hash, proposal_id, owner) nullifier so the same note can
        // claim across DIFFERENT proposals but not the same proposal twice.
        let note_hash = compute_confirmed_note_hash_for_nullification(confirmed);
        let pid = proposal_id as Field;
        let claim_key = poseidon2_hash([note_hash, pid]);
        self.storage.d_claim_nullifiers.at(claim_key).at(caller).claim();

        let note = confirmed.note;
        let share = total_claim(
            note.amount,
            note.cum_before,
            note.is_small,
            supplied_small_pool,
            supplied_small_total,
            supplied_fifo_cap,
        );
        assert(share > 0, "share is zero");

        // Private mint to caller (HousingFund is FSFT's immutable minter, so the
        // token sees msg_sender = HousingFund and passes _validate_minter).
        self.call(Token::at(fund_token_addr).mint_to_private(caller, share));

        // Public tail: verify the caller-supplied snapshots and fund_token_addr,
        // enforce the fail-closed ceiling, and bump d_claimed_total.
        self.enqueue_self._record_distribution_claim(
            proposal_id,
            share,
            fund_token_addr,
            supplied_small_pool,
            supplied_small_total,
            supplied_fifo_cap,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_distribution_claim(
        proposal_id: u32,
        share: u128,
        supplied_fund_token: AztecAddress,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
    ) {
        let pid = proposal_id as Field;
        assert(self.storage.d_open.at(pid).read(), "distribution not open");
        assert(
            supplied_fund_token == self.storage.fund_token.read(),
            "fund token mismatch",
        );
        assert(supplied_small_pool == self.storage.d_small_pool.at(pid).read(), "small pool mismatch");
        assert(supplied_small_total == self.storage.d_small_total.at(pid).read(), "small total mismatch");
        assert(supplied_fifo_cap == self.storage.d_fifo_cap.at(pid).read(), "fifo cap mismatch");

        let claimed_total = self.storage.d_claimed_total.at(pid).read();
        let pool = self.storage.d_amount.at(pid).read();
        assert(claimed_total + share <= pool, "distribution exhausted");
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

    // Public cursor for PXE callers to stamp a private deposit (supplied-then-verified).
    #[external("public")]
    #[view]
    fn get_deposit_cursor() -> pub DepositCursor {
        DepositCursor {
            cum_deposits: self.storage.cum_deposits.read(),
            cum_small_deposits: self.storage.cum_small_deposits.read(),
            deposit_seq: self.storage.deposit_seq.read(),
            small_threshold: self.storage.small_threshold.read(),
        }
    }

    #[external("utility")]
    unconstrained fn get_deposit_cursor_unconstrained() -> pub DepositCursor {
        DepositCursor {
            cum_deposits: self.storage.cum_deposits.read(),
            cum_small_deposits: self.storage.cum_small_deposits.read(),
            deposit_seq: self.storage.deposit_seq.read(),
            small_threshold: self.storage.small_threshold.read(),
        }
    }

    // Public-path claimable preview for a specific deposit record (by global seq).
    #[external("utility")]
    unconstrained fn get_claimable_amount(proposal_id: u32, user: AztecAddress, seq: u64) -> pub u128 {
        let pid = proposal_id as Field;
        let is_open = self.storage.d_open.at(pid).read();
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, pid]);
        let has_claimed = self.storage.d_record_has_claimed.at(claim_key).read();
        let rec = self.storage.deposit_records.at(poseidon2_hash([user.to_field(), seq as Field])).read();

        if !is_open | has_claimed | (rec.owner != user) | (rec.amount == 0) {
            0
        } else {
            let small_pool = self.storage.d_small_pool.at(pid).read();
            let small_total = self.storage.d_small_total.at(pid).read();
            let fifo_cap = self.storage.d_fifo_cap.at(pid).read();
            total_claim(rec.amount, rec.cum_before, rec.is_small, small_pool, small_total, fifo_cap)
        }
    }

    #[external("utility")]
    unconstrained fn has_claimed(proposal_id: u32, user: AztecAddress, seq: u64) -> pub bool {
        let pid = proposal_id as Field;
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, pid]);
        self.storage.d_record_has_claimed.at(claim_key).read()
    }

    // Per-user public deposit-record enumeration (so a caller can list the seqs
    // they may claim against). Private deposits use get_my_deposit_notes instead.
    #[external("utility")]
    unconstrained fn get_my_deposit_record_count(user: AztecAddress) -> pub u32 {
        self.storage.user_deposit_count.at(user).read()
    }

    #[external("utility")]
    unconstrained fn get_my_deposit_record(user: AztecAddress, index: u32) -> pub DepositRecordView {
        let seq = self.storage.user_deposit_seq.at(poseidon2_hash([user.to_field(), index as Field])).read();
        let rec = self.storage.deposit_records.at(poseidon2_hash([user.to_field(), seq as Field])).read();
        DepositRecordView {
            seq,
            amount: rec.amount,
            cum_before: rec.cum_before,
            is_small: rec.is_small,
        }
    }

    #[external("utility")]
    unconstrained fn get_distribution_status(proposal_id: u32) -> pub DistributionStatus {
        let pid = proposal_id as Field;
        DistributionStatus {
            open: self.storage.d_open.at(pid).read(),
            amount: self.storage.d_amount.at(pid).read(),
            snapshot_total: self.storage.d_snapshot_total.at(pid).read(),
            small_total: self.storage.d_small_total.at(pid).read(),
            small_pool: self.storage.d_small_pool.at(pid).read(),
            fifo_cap: self.storage.d_fifo_cap.at(pid).read(),
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
    /// .simulate({ from: owner }).
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
