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
        history::{note::assert_note_existed_by, nullifier::assert_nullifier_did_not_exist_by},
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
            hash::{compute_siloed_nullifier, poseidon2_hash},
            traits::{Deserialize, Packable, Serialize, ToField},
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable, SingleUseClaim, StateVariable},
        utils::array,
    };

    // Default "small depositor" cutoff (in whole EUR units). Configurable by admin.
    global DEFAULT_SMALL_THRESHOLD: u128 = 10000;
    // Allocation split: 30% reserved for the small-depositor pool, 70% FIFO.
    global SMALL_POOL_BPS: u128 = 3000;
    // Domain separator for the per-note withdraw marker nullifier (H1). withdraw_private
    // emits poseidon2([note_hash, this]) so claim/reinvest paths can prove (via
    // nullifier non-existence at a distribution's snapshot block) that a deposit
    // note was not withdrawn by then.
    global WITHDRAW_NULLIFIER_DOMAIN: Field = 0x1505_5749_5448_4452_4157; // "WITHDRAW" tag
    // Upper bound on public DepositRecords retracted per withdraw() (H2). A public
    // depositor whose withdrawal spans more than this many of their own records must
    // split the withdrawal; the loop is bounded for the public VM.
    global MAX_WITHDRAW_RECORDS: u32 = 64;

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
        // -- Phase 1.1: rent ingestion (the real cash-flow primitive) ---------
        // Appended at the END of the struct so existing storage slots (read by
        // the slot-based frontend reader) are not shifted.
        // Cumulative rent income recorded across all properties (lifetime, gross
        // EUR units). Transparent like the other aggregates. NOT part of NAV:
        // NAV = total_deposits (pooled capital only); rent is surfaced separately
        // as a claimable yield and never inflates share value.
        total_rent_income: PublicMutable<u64, Context>,
        // Per-property cumulative rent, keyed by property_id (as Field).
        rent_income_by_property: Map<Field, PublicMutable<u64, Context>, Context>,
        // Optional keeper allowed to post rent (in addition to admin). An oracle
        // /keeper that reports collected rent per property. Zero = admin-only.
        rent_keeper: PublicMutable<AztecAddress, Context>,
        // -- Phase 1.1 step 2: claimable rent distribution --------------------
        // The EUR stablecoin the fund pays rent yield from (its own public
        // balance). Set via set_eur_token; zero until wired.
        eur_token: PublicMutable<AztecAddress, Context>,
        // Rent recorded but not yet opened into a rent-distribution epoch.
        undistributed_rent: PublicMutable<u64, Context>,
        // Lifetime rent paid out to holders. Rent still in the fund is
        // total_rent_income - total_rent_claimed (claimed rent has left the
        // fund); this is surfaced separately and does NOT back NAV
        // (NAV = total_deposits, pooled capital only).
        total_rent_claimed: PublicMutable<u64, Context>,
        // Per-rent-epoch snapshots, mirroring the d_* proposal-distribution maps
        // but paid in EUR (yield) instead of minting FSFT (ownership).
        r_open: Map<Field, PublicMutable<bool, Context>, Context>,
        r_amount: Map<Field, PublicMutable<u128, Context>, Context>,
        r_snapshot_total: Map<Field, PublicMutable<u128, Context>, Context>,
        r_small_total: Map<Field, PublicMutable<u128, Context>, Context>,
        r_small_pool: Map<Field, PublicMutable<u128, Context>, Context>,
        r_fifo_cap: Map<Field, PublicMutable<u128, Context>, Context>,
        r_claimed_total: Map<Field, PublicMutable<u128, Context>, Context>,
        // Public-path anti-double-claim, keyed poseidon2([owner, seq, rent_epoch_id]).
        r_record_has_claimed: Map<Field, PublicMutable<bool, Context>, Context>,
        // Private-path nullifiers, keyed poseidon2([note_hash, rent_epoch_id]).
        r_claim_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
        // -- Capped-return (ROR) parameters -----------------------------------
        // Return on Rent in basis points (e.g. 300 = 3%). Rent is defined as
        // ROR * acquisition_value -- the cost-based, below-market rent that flows
        // FULLY to investors (the "cap" is cost-based rent, not a reserve skim;
        // see CLAUDE.md "Economic model"). The keeper still posts ACTUAL collected
        // rent via record_rent; ROR drives the EXPECTED/billed rent (get_expected_*).
        // 0 = unset: expected rent reads 0 until an admin configures it.
        ror_bps: PublicMutable<u64, Context>,
        // Per-property acquisition value (whole EUR), keyed by property_id.
        acquisition_value_by_property: Map<Field, PublicMutable<u64, Context>, Context>,
        // -- Withdraw-vs-reinvest ledger (PUBLIC path only) -------------------
        // Per-holder lifetime rent taken as fiat (claim_rent) vs reinvested back
        // into the fund as a new deposit (reinvest_rent). The private claim paths
        // cannot attribute per-holder without leaking identity, so this ledger
        // covers the public path; private claimants track their own off-chain.
        rent_withdrawn_by: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        rent_reinvested_by: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        // -- Phase 0 (H1/H3): snapshot block per distribution / rent epoch ----
        // The block at which open_distribution / open_rent_distribution snapshotted
        // the deposit set. The private claim/reinvest paths fetch this block's
        // header and prove (a) the deposit note EXISTED and (b) its withdraw marker
        // did NOT exist as of that block -- binding every claim to the snapshot so a
        // post-snapshot depositor cannot claim and a pre-snapshot withdrawer cannot.
        d_snapshot_block: Map<Field, PublicMutable<u32, Context>, Context>,
        r_snapshot_block: Map<Field, PublicMutable<u32, Context>, Context>,
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

    // Available (unencumbered) balance: pooled deposits net of capital that is
    // out in DeFi or already allocated to executed proposals. Single-sourced so
    // every guard (deploy_to_defi / reserve_for_property / open_distribution /
    // withdraw paths) uses the identical subtraction order and saturation
    // semantics. Pure helper -- caller reads the three aggregates and passes them.
    #[contract_library_method]
    fn available_balance(deposits: u64, in_defi: u64, allocated: u64) -> u64 {
        deposits - in_defi - allocated
    }

    // H1: the per-note withdraw marker (inner nullifier). withdraw_private pushes
    // this; claim/reinvest paths recompute it from the same kernel-verified note
    // and prove its SILOED form was absent at the distribution's snapshot block.
    #[contract_library_method]
    fn withdraw_marker_nullifier(note_hash: Field) -> Field {
        poseidon2_hash([note_hash, WITHDRAW_NULLIFIER_DOMAIN])
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
        self.storage.total_rent_income.write(0);
        self.storage.undistributed_rent.write(0);
        self.storage.total_rent_claimed.write(0);
        self.storage.ror_bps.write(0);
        // rent_keeper / eur_token / acquisition values intentionally left unset
        // (zero) until wired by the admin/keeper.
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

    // Admin: designate a keeper allowed to post collected rent (an oracle/keeper
    // that reports rent per property). Zero address = admin-only.
    #[external("public")]
    fn set_rent_keeper(keeper: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.rent_keeper.write(keeper);
    }

    // Admin: set the fund-level Return on Rent (ROR) in basis points. Rent is
    // defined as ROR * acquisition_value (cost-based, below market, fully to
    // investors), so this is the master return parameter. Capped at 100% (10000
    // bps) as a sanity bound.
    #[external("public")]
    fn set_ror_bps(bps: u64) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(bps <= 10000, "ror bps out of range");
        self.storage.ror_bps.write(bps);
    }

    // Admin or keeper: record a property's acquisition value (whole EUR). The
    // expected rent for the property is ROR * acquisition_value (get_expected_*).
    #[external("public")]
    fn set_acquisition_value(property_id: u32, value: u64) {
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let keeper = self.storage.rent_keeper.read();
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to set acquisition value",
        );
        self.storage.acquisition_value_by_property.at(property_id as Field).write(value);
    }

    // -- Core operations --------------------------------------------------

    #[external("public")]
    fn deposit(amount: u64) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        assert(amount > 0, "amount must be positive");
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        // PRIVACY NOTE (M15): this public `is_investor(caller)` check publicly
        // confirms the caller's KYC status (transparency mode). The privacy-
        // preserving everyday path is `deposit_private`, which attests a hinted
        // KYC credential without exposing the caller on the public boundary.
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
        let available = available_balance(deposits, in_defi, allocated);
        assert(amount <= available, "insufficient available balance");

        let updated_ticket = ticket - amount;
        self.storage.deposit_tickets.at(caller).write(updated_ticket);
        self.storage.total_deposits.write(deposits - amount);

        // H2: retract this caller's public DepositRecords FIFO (oldest first) so a
        // withdrawn public depositor stops minting FSFT / claiming rent on principal
        // they pulled out. cum_deposits stays monotonic (the global FIFO axis is
        // shared and must not shift other depositors' intervals); we only SHRINK
        // this caller's own record amounts, which can never increase any claim, so
        // the "sum of claims <= pool" tiling invariant is preserved (fail-closed:
        // the freed FIFO/small capacity simply becomes dust). The sum of a caller's
        // record amounts always equals their deposit_tickets, so `remaining` reaches
        // zero unless the withdrawal spans more than MAX_WITHDRAW_RECORDS records.
        let mut remaining = amount as u128;
        let count = self.storage.user_deposit_count.at(caller).read();
        for i in 0..MAX_WITHDRAW_RECORDS {
            if (i < count) & (remaining > 0) {
                let seq = self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), i as Field])).read();
                let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
                let rec = self.storage.deposit_records.at(rec_key).read();
                if rec.amount > 0 {
                    let reduce = if remaining < rec.amount { remaining } else { rec.amount };
                    self.storage.deposit_records.at(rec_key).write(DepositRecord {
                        owner: rec.owner,
                        amount: rec.amount - reduce,
                        cum_before: rec.cum_before,
                        is_small: rec.is_small,
                    });
                    remaining -= reduce;
                }
            }
        }
        assert(remaining == 0, "withdraw spans too many records");
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
        let available = available_balance(deposits, in_defi, allocated);
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
        let available = available_balance(deposits, in_defi, allocated);
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
        let available = available_balance(deposits, in_defi, allocated);
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
        // H1/H3: record the snapshot block so private claims can bind to it.
        self.storage.d_snapshot_block.at(pid).write(self.context.block_number());

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

        // H3: bind the claim to the snapshot. A record created AFTER the
        // distribution was opened (cum_before+amount beyond the snapshot total)
        // never participated in that pool and must not dilute it.
        assert(
            rec.cum_before + rec.amount <= self.storage.d_snapshot_total.at(pid).read(),
            "deposit not in snapshot",
        );

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

    // -- Phase 1.1 step 2: claimable rent distribution --------------------
    // Rent is distributed in "epochs": a keeper opens an epoch for some of the
    // collected-but-undistributed rent, snapshotting the SAME FIFO + 30%
    // small-floor split used for proposal distributions. Each depositor then
    // claims their share, paid in EUR (yield) from the fund's own balance.
    // Reuses total_claim(), so small early savers are over-allocated rent too.
    #[external("public")]
    fn open_rent_distribution(rent_epoch_id: u32, amount: u64) {
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let keeper = self.storage.rent_keeper.read();
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to open rent distribution",
        );

        let rid = rent_epoch_id as Field;
        assert(!self.storage.r_open.at(rid).read(), "rent distribution already opened");
        assert(amount > 0, "amount must be positive");

        let undistributed = self.storage.undistributed_rent.read();
        assert(amount <= undistributed, "amount exceeds undistributed rent");

        let snapshot_total = self.storage.cum_deposits.read();
        assert(snapshot_total > 0, "no deposits to distribute to");

        let pool = amount as u128;
        let small_total = self.storage.cum_small_deposits.read();
        let small_pool = (pool * SMALL_POOL_BPS) / 10000;
        let fifo_cap = pool - small_pool;

        self.storage.r_open.at(rid).write(true);
        self.storage.r_amount.at(rid).write(pool);
        self.storage.r_snapshot_total.at(rid).write(snapshot_total);
        self.storage.r_small_total.at(rid).write(small_total);
        self.storage.r_small_pool.at(rid).write(small_pool);
        self.storage.r_fifo_cap.at(rid).write(fifo_cap);
        self.storage.r_claimed_total.at(rid).write(0);
        // H1/H3: record the snapshot block so private rent claims can bind to it.
        self.storage.r_snapshot_block.at(rid).write(self.context.block_number());

        self.storage.undistributed_rent.write(undistributed - amount);
    }

    // Public-path rent claim for a SPECIFIC deposit record (by global seq), paid
    // in EUR. Mirrors claim_distribution but transfers EUR instead of minting FSFT.
    #[external("public")]
    fn claim_rent(rent_epoch_id: u32, seq: u64) {
        let rid = rent_epoch_id as Field;
        assert(self.storage.r_open.at(rid).read(), "rent distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        // H3: bind to the snapshot -- a deposit made after the epoch opened did
        // not back this rent and must not dilute the per-epoch pool.
        assert(
            rec.cum_before + rec.amount <= self.storage.r_snapshot_total.at(rid).read(),
            "deposit not in snapshot",
        );

        let claim_key = poseidon2_hash([caller.to_field(), seq as Field, rid]);
        assert(!self.storage.r_record_has_claimed.at(claim_key).read(), "already claimed");

        let small_pool = self.storage.r_small_pool.at(rid).read();
        let small_total = self.storage.r_small_total.at(rid).read();
        let fifo_cap = self.storage.r_fifo_cap.at(rid).read();
        let share = total_claim(rec.amount, rec.cum_before, rec.is_small, small_pool, small_total, fifo_cap);
        assert(share > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        let claimed_total = self.storage.r_claimed_total.at(rid).read();
        let pool = self.storage.r_amount.at(rid).read();
        assert(claimed_total + share <= pool, "rent distribution exhausted");

        // Pay EUR yield from the fund's own public balance to the claimant. The
        // fund is msg_sender == from, so the transfer is self-authorized (nonce 0).
        // Reverts if the fund holds insufficient EUR (fail-closed, never silent).
        let eur = self.storage.eur_token.read();
        assert(!eur.is_zero(), "eur token not set");
        self.call(Token::at(eur).transfer_public_to_public(self.context.this_address(), caller, share, 0));

        self.storage.r_claimed_total.at(rid).write(claimed_total + share);
        self.storage.r_record_has_claimed.at(claim_key).write(true);
        let claimed = self.storage.total_rent_claimed.read();
        self.storage.total_rent_claimed.write(claimed + (share as u64));
        // Ledger: rent this holder took as fiat (the withdraw side of the
        // withdraw-vs-reinvest choice).
        let prev_withdrawn = self.storage.rent_withdrawn_by.at(caller).read();
        self.storage.rent_withdrawn_by.at(caller).write(prev_withdrawn + (share as u64));
    }

    // Public-path REINVEST: instead of paying the rent share out as EUR
    // (claim_rent), credit it as a NEW deposit for the caller -- "put it back in
    // the fund, the usual deposit route" (CLAUDE.md economic model). The rent EUR
    // stays in the fund; the counters shift from the rent pool to capital
    // (total_rent_claimed += share, total_deposits += share), so NAV grows and
    // the holder compounds (a larger deposit -> larger future FSFT + rent share).
    // No EUR transfer -- the EUR was already in the fund (custody is orchestrated
    // off-contract, exactly like deposit/record_rent). Public path only: the
    // per-holder reinvested ledger needs the caller address, which the private
    // path keeps hidden.
    #[external("public")]
    fn reinvest_rent(rent_epoch_id: u32, seq: u64) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        let rid = rent_epoch_id as Field;
        assert(self.storage.r_open.at(rid).read(), "rent distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        // H3: bind to the snapshot -- a deposit made after the epoch opened did
        // not back this rent and must not dilute the per-epoch pool.
        assert(
            rec.cum_before + rec.amount <= self.storage.r_snapshot_total.at(rid).read(),
            "deposit not in snapshot",
        );

        let claim_key = poseidon2_hash([caller.to_field(), seq as Field, rid]);
        assert(!self.storage.r_record_has_claimed.at(claim_key).read(), "already claimed");

        let small_pool = self.storage.r_small_pool.at(rid).read();
        let small_total = self.storage.r_small_total.at(rid).read();
        let fifo_cap = self.storage.r_fifo_cap.at(rid).read();
        let share = total_claim(rec.amount, rec.cum_before, rec.is_small, small_pool, small_total, fifo_cap);
        assert(share > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        let claimed_total = self.storage.r_claimed_total.at(rid).read();
        let pool = self.storage.r_amount.at(rid).read();
        assert(claimed_total + share <= pool, "rent distribution exhausted");

        // Consume the rent claim and move it out of the rent pool.
        self.storage.r_claimed_total.at(rid).write(claimed_total + share);
        self.storage.r_record_has_claimed.at(claim_key).write(true);
        let claimed = self.storage.total_rent_claimed.read();
        self.storage.total_rent_claimed.write(claimed + (share as u64));

        // Re-deposit the share as fresh capital for the caller (the usual deposit
        // route): stamp a new public deposit record at the current FIFO cursor,
        // advance the cursors, and bump the aggregates. `share` is bounded by the
        // rent pool (a u64 amount), so the u64 cast is safe.
        let share_u64 = share as u64;
        let cum_before = self.storage.cum_deposits.read();
        let new_seq = self.storage.deposit_seq.read();
        let threshold = self.storage.small_threshold.read();
        let is_small = share <= threshold;

        let new_rec_key = poseidon2_hash([caller.to_field(), new_seq as Field]);
        self.storage.deposit_records.at(new_rec_key).write(DepositRecord {
            owner: caller,
            amount: share,
            cum_before,
            is_small,
        });
        let dcount = self.storage.user_deposit_count.at(caller).read();
        self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), dcount as Field])).write(
            new_seq,
        );
        self.storage.user_deposit_count.at(caller).write(dcount + 1);

        self.storage.cum_deposits.write(cum_before + share);
        if is_small {
            self.storage.cum_small_deposits.write(self.storage.cum_small_deposits.read() + share);
        }
        self.storage.deposit_seq.write(new_seq + 1);

        let previous_ticket = self.storage.deposit_tickets.at(caller).read();
        if previous_ticket == 0 {
            if !self.storage.investor_seen.at(caller).read() {
                let next_index = self.storage.investor_count.read();
                self.storage.investor_index.at(next_index as Field).write(caller);
                self.storage.investor_count.write(next_index + 1);
                self.storage.investor_seen.at(caller).write(true);
            }
        }
        self.storage.deposit_tickets.at(caller).write(previous_ticket + share_u64);

        let current = self.storage.total_deposits.read();
        self.storage.total_deposits.write(current + share_u64);

        // Ledger: rent this holder reinvested (the reinvest side of the choice).
        let prev_reinvested = self.storage.rent_reinvested_by.at(caller).read();
        self.storage.rent_reinvested_by.at(caller).write(prev_reinvested + share_u64);
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

    // -- Phase 1.1: rent ingestion ----------------------------------------
    // Record rent collected for a funded property -- the real cash-flow primitive
    // behind "earn the rent". An authorized keeper (or admin) posts the rent
    // collected per property; it accrues to the fund's transparent rent-income
    // aggregate, surfaced separately from NAV (NAV = total_deposits, pooled
    // capital only). There is NO simulated yield: rent only enters
    // here, posted by an authorized party against a real collection, never
    // fabricated. Distributing rent to FSFT holders (as claimable EUR yield, or
    // -- only when reinvested -- as new capital) is layered on top -- see
    // docs/PHASE1_YIELD_AND_RENT.md.
    #[external("public")]
    fn record_rent(property_id: u32, amount: u64) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        let caller = self.msg_sender();
        let admin = self.storage.admin.read();
        let keeper = self.storage.rent_keeper.read();
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to record rent",
        );
        assert(amount > 0, "rent amount must be positive");

        let pkey = property_id as Field;
        let prev = self.storage.rent_income_by_property.at(pkey).read();
        self.storage.rent_income_by_property.at(pkey).write(prev + amount);

        let total = self.storage.total_rent_income.read();
        self.storage.total_rent_income.write(total + amount);

        // Track the not-yet-distributed portion so a rent epoch can only hand out
        // rent that was actually collected.
        let undistributed = self.storage.undistributed_rent.read();
        self.storage.undistributed_rent.write(undistributed + amount);
    }

    // Admin: wire the EUR stablecoin the fund pays rent yield from (its own
    // public balance). Required before any rent can be claimed.
    #[external("public")]
    fn set_eur_token(eur_token: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        self.storage.eur_token.write(eur_token);
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
        //
        // PRIVACY NOTE (M12 — known linkage): this commitment is the constant
        // handle `poseidon2([owner, nonce])`. The identical value is also
        // published by Governance.cast_vote_private's public tail, so an
        // on-chain observer can cluster the same user's deposits and votes by
        // matching the commitment field (the owner/nonce pre-image stays
        // private, but the equality of the published field is enough to link).
        // Fully closing this requires checking revocation privately — migrate
        // KYCVerifier.revocations to DelayedPublicMutable (verify the pattern
        // against aztec-packages v4.3 first) — or binding a per-action salt
        // `poseidon2([owner, nonce, action_domain])` AND having the verifier
        // register a revocation entry per action domain. Documented here until
        // that migration lands.
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
        assert(!self.storage.is_paused.read(), "fund is paused");
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
        // H1: also emit a deterministic, claim-recomputable withdraw marker. The
        // SingleUseClaim above is owner-siloed (private, double-withdraw guard) but
        // CANNOT be re-derived by the claim paths; this marker can, so a claim can
        // prove (nullifier non-existence at the distribution snapshot block) that
        // the note had not been withdrawn by then. Without it, withdraw only proved
        // INCLUSION historically -- it never made the note ineligible to claim.
        self.context.push_nullifier(withdraw_marker_nullifier(note_hash));

        self.enqueue_self._record_withdraw_private(confirmed.note.amount);
    }

    #[external("public")]
    #[only_self]
    fn _record_withdraw_private(amount: u128) {
        let amount_u64 = amount as u64;
        let deposits = self.storage.total_deposits.read();
        let in_defi = self.storage.total_in_defi.read();
        let allocated = self.storage.total_allocated.read();
        let available = available_balance(deposits, in_defi, allocated);
        assert(amount_u64 <= available, "insufficient available balance");
        self.storage.total_deposits.write(deposits - amount_u64);
        // cum_deposits is NOT decremented (monotonic FIFO axis). The withdraw
        // marker emitted in the private leg makes this note ineligible for any
        // distribution/rent epoch snapshotted at or after this block (H1).
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
        supplied_snapshot_block: u32,
    ) {
        // H1/H3: prove the deposit against the SNAPSHOT block, not a caller-chosen
        // anchor. assert_note_existed_by binds the claim to a note that existed at
        // snapshot time (excludes post-snapshot deposits = H3), and the withdraw
        // marker non-existence check below excludes notes withdrawn by then (H1).
        // supplied_snapshot_block is re-checked against d_snapshot_block in the tail.
        let header = self.context.get_block_header_at(supplied_snapshot_block);
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
        // H1: a note withdrawn at/before the snapshot block is ineligible.
        assert_nullifier_did_not_exist_by(
            header,
            compute_siloed_nullifier(self.context.this_address(), withdraw_marker_nullifier(note_hash)),
        );
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
            supplied_snapshot_block,
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
        supplied_snapshot_block: u32,
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
        // H1/H3: the private leg proved note existence + non-withdrawal against
        // THIS block; pin it to the real snapshot so an attacker cannot pick an
        // earlier (pre-withdraw / pre-deposit) block.
        assert(
            supplied_snapshot_block == self.storage.d_snapshot_block.at(pid).read(),
            "snapshot block mismatch",
        );

        let claimed_total = self.storage.d_claimed_total.at(pid).read();
        let pool = self.storage.d_amount.at(pid).read();
        assert(claimed_total + share <= pool, "distribution exhausted");
        self.storage.d_claimed_total.at(pid).write(claimed_total + share);
    }

    // -- Phase 1.1 step 2: private rent claim ---------------------------------
    // Mirror of claim_distribution_private, but pays EUR yield instead of minting
    // FSFT: the share is computed from the KERNEL-VERIFIED DepositNote with the
    // caller-supplied snapshots (re-checked in the public tail), and the EUR is
    // moved from the fund's PUBLIC balance to the caller's PRIVATE balance via
    // transfer_public_to_private (so the recipient's balance is never exposed).
    #[external("private")]
    fn claim_rent_private(
        rent_epoch_id: u32,
        hinted_deposit: HintedNote<DepositNote>,
        eur_token_addr: AztecAddress,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
        supplied_snapshot_block: u32,
    ) {
        // RENT-CLAIM PROLOGUE (kept byte-for-byte in lockstep with
        // reinvest_rent_private below): fetch the snapshot header, prove the
        // DepositNote existed and is caller-owned, reject notes withdrawn by the
        // snapshot, burn the per-(note,epoch) claim nullifier, and compute the
        // share. The correctness-sensitive math is already single-sourced via the
        // pure helpers total_claim / withdraw_marker_nullifier /
        // compute_confirmed_note_hash_for_nullification; the surrounding context
        // orchestration cannot be a shared free function (it needs self/context),
        // so any change here MUST be mirrored in reinvest_rent_private.
        // H1/H3: prove the deposit against the rent-epoch SNAPSHOT block (re-checked
        // in the tail), excluding post-snapshot deposits, and reject notes withdrawn
        // by then via the withdraw-marker non-existence check.
        let header = self.context.get_block_header_at(supplied_snapshot_block);
        let confirmed = assert_note_existed_by(header, hinted_deposit);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "deposit note not owned by caller");
        assert(confirmed.note.owner == caller, "deposit note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "deposit note from wrong contract",
        );

        // Per-(note_hash, rent_epoch_id, owner) nullifier: a note claims each rent
        // epoch at most once, but can claim across different epochs.
        let note_hash = compute_confirmed_note_hash_for_nullification(confirmed);
        // H1: a note withdrawn at/before the snapshot block is ineligible.
        assert_nullifier_did_not_exist_by(
            header,
            compute_siloed_nullifier(self.context.this_address(), withdraw_marker_nullifier(note_hash)),
        );
        let rid = rent_epoch_id as Field;
        let claim_key = poseidon2_hash([note_hash, rid]);
        self.storage.r_claim_nullifiers.at(claim_key).at(caller).claim();

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

        // Private EUR payout: fund's public EUR -> caller's private EUR notes.
        // from == fund == msg_sender, so self-authorized (nonce 0). Reverts if the
        // fund holds insufficient EUR.
        self.call(
            Token::at(eur_token_addr).transfer_public_to_private(
                self.context.this_address(),
                caller,
                share,
                0,
            ),
        );

        // Public tail: verify the caller-supplied snapshots + eur token, enforce
        // the fail-closed ceiling, and bump the claimed counters.
        self.enqueue_self._record_rent_claim(
            rent_epoch_id,
            share,
            eur_token_addr,
            supplied_small_pool,
            supplied_small_total,
            supplied_fifo_cap,
            supplied_snapshot_block,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_rent_claim(
        rent_epoch_id: u32,
        share: u128,
        supplied_eur_token: AztecAddress,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
        supplied_snapshot_block: u32,
    ) {
        let rid = rent_epoch_id as Field;
        assert(self.storage.r_open.at(rid).read(), "rent distribution not open");
        assert(supplied_eur_token == self.storage.eur_token.read(), "eur token mismatch");
        assert(supplied_small_pool == self.storage.r_small_pool.at(rid).read(), "small pool mismatch");
        assert(supplied_small_total == self.storage.r_small_total.at(rid).read(), "small total mismatch");
        assert(supplied_fifo_cap == self.storage.r_fifo_cap.at(rid).read(), "fifo cap mismatch");
        // H1/H3: pin to the real rent-epoch snapshot block.
        assert(
            supplied_snapshot_block == self.storage.r_snapshot_block.at(rid).read(),
            "snapshot block mismatch",
        );

        let claimed_total = self.storage.r_claimed_total.at(rid).read();
        let pool = self.storage.r_amount.at(rid).read();
        assert(claimed_total + share <= pool, "rent distribution exhausted");
        self.storage.r_claimed_total.at(rid).write(claimed_total + share);
        let claimed = self.storage.total_rent_claimed.read();
        self.storage.total_rent_claimed.write(claimed + (share as u64));
    }

    // -- Phase 1.1 step 3: PRIVATE reinvest -----------------------------------
    // The private mirror of reinvest_rent: a private depositor reinvests accrued
    // rent instead of withdrawing it. The share is computed from the
    // KERNEL-VERIFIED DepositNote + caller-supplied epoch snapshots (re-checked in
    // the tail); rather than paying EUR out (claim_rent_private), it mints a NEW
    // private DepositNote to the caller for `share` -- the rent re-enters as fresh
    // capital. The new note's FIFO cursors are supplied-then-verified exactly like
    // deposit_private. No EUR moves: the rent EUR stays in the fund and
    // reclassifies from the rent pool to capital. Uses the SAME (note, epoch)
    // nullifier slot as claim_rent_private, so a note cannot both withdraw and
    // reinvest the same epoch.
    #[external("private")]
    fn reinvest_rent_private(
        rent_epoch_id: u32,
        hinted_deposit: HintedNote<DepositNote>,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
        supplied_cum_before: u128,
        supplied_seq: u64,
        supplied_is_small: bool,
        supplied_snapshot_block: u32,
    ) {
        // RENT-CLAIM PROLOGUE (mirror of claim_rent_private; keep in lockstep):
        // the correctness-sensitive math is single-sourced via total_claim /
        // withdraw_marker_nullifier / compute_confirmed_note_hash_for_nullification.
        // H1/H3: prove the claimed-against deposit at the rent-epoch SNAPSHOT block
        // (re-checked in the tail) and reject notes withdrawn by then. The NEW note
        // minted below is unaffected -- only the rent-bearing source note is bound.
        let header = self.context.get_block_header_at(supplied_snapshot_block);
        let confirmed = assert_note_existed_by(header, hinted_deposit);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "deposit note not owned by caller");
        assert(confirmed.note.owner == caller, "deposit note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "deposit note from wrong contract",
        );

        // Shared with claim_rent_private: a note acts at most once per epoch.
        let note_hash = compute_confirmed_note_hash_for_nullification(confirmed);
        // H1: a note withdrawn at/before the snapshot block is ineligible.
        assert_nullifier_did_not_exist_by(
            header,
            compute_siloed_nullifier(self.context.this_address(), withdraw_marker_nullifier(note_hash)),
        );
        let rid = rent_epoch_id as Field;
        let claim_key = poseidon2_hash([note_hash, rid]);
        self.storage.r_claim_nullifiers.at(claim_key).at(caller).claim();

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

        // Mint the reinvested capital as a NEW DepositNote in the caller's set,
        // stamped with the supplied FIFO cursors (verified in the public tail).
        let new_note = DepositNote::new(caller, share, supplied_cum_before, supplied_seq, supplied_is_small);
        self.storage.deposit_notes.at(caller).insert(new_note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        self.enqueue_self._record_rent_reinvest(
            rent_epoch_id,
            share,
            supplied_small_pool,
            supplied_small_total,
            supplied_fifo_cap,
            supplied_cum_before,
            supplied_seq,
            supplied_is_small,
            supplied_snapshot_block,
        );
    }

    #[external("public")]
    #[only_self]
    fn _record_rent_reinvest(
        rent_epoch_id: u32,
        share: u128,
        supplied_small_pool: u128,
        supplied_small_total: u128,
        supplied_fifo_cap: u128,
        supplied_cum_before: u128,
        supplied_seq: u64,
        supplied_is_small: bool,
        supplied_snapshot_block: u32,
    ) {
        assert(!self.storage.is_paused.read(), "fund is paused");
        let rid = rent_epoch_id as Field;
        // (a) Rent side: verify epoch + snapshots, enforce ceiling, consume rent.
        assert(self.storage.r_open.at(rid).read(), "rent distribution not open");
        assert(supplied_small_pool == self.storage.r_small_pool.at(rid).read(), "small pool mismatch");
        assert(supplied_small_total == self.storage.r_small_total.at(rid).read(), "small total mismatch");
        assert(supplied_fifo_cap == self.storage.r_fifo_cap.at(rid).read(), "fifo cap mismatch");
        // H1/H3: pin to the real rent-epoch snapshot block.
        assert(
            supplied_snapshot_block == self.storage.r_snapshot_block.at(rid).read(),
            "snapshot block mismatch",
        );
        let claimed_total = self.storage.r_claimed_total.at(rid).read();
        let pool = self.storage.r_amount.at(rid).read();
        assert(claimed_total + share <= pool, "rent distribution exhausted");
        self.storage.r_claimed_total.at(rid).write(claimed_total + share);
        let claimed = self.storage.total_rent_claimed.read();
        self.storage.total_rent_claimed.write(claimed + (share as u64));

        // (b) Deposit side: supplied-then-verified cursor stamping (mirrors
        // _record_deposit_private), advancing the FIFO axis + total_deposits.
        let cum_before = self.storage.cum_deposits.read();
        let seq = self.storage.deposit_seq.read();
        let threshold = self.storage.small_threshold.read();
        assert(supplied_cum_before == cum_before, "stale cum_before");
        assert(supplied_seq == seq, "stale seq");
        assert(supplied_is_small == (share <= threshold), "is_small mismatch");
        self.storage.cum_deposits.write(cum_before + share);
        if supplied_is_small {
            self.storage.cum_small_deposits.write(self.storage.cum_small_deposits.read() + share);
        }
        self.storage.deposit_seq.write(seq + 1);
        let total = self.storage.total_deposits.read();
        self.storage.total_deposits.write(total + (share as u64));
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
        let available = available_balance(total, in_defi, allocated);
        FundStatsView {
            total_deposits: total,
            total_in_defi: in_defi,
            total_allocated: allocated,
            available,
        }
    }

    // -- Phase 1.1: rent income getters -----------------------------------

    #[external("utility")]
    unconstrained fn get_total_rent_income() -> pub u64 {
        self.storage.total_rent_income.read()
    }

    #[external("utility")]
    unconstrained fn get_property_rent(property_id: u32) -> pub u64 {
        self.storage.rent_income_by_property.at(property_id as Field).read()
    }

    #[external("utility")]
    unconstrained fn get_rent_keeper() -> pub AztecAddress {
        self.storage.rent_keeper.read()
    }

    #[external("utility")]
    unconstrained fn get_eur_token() -> pub AztecAddress {
        self.storage.eur_token.read()
    }

    // Rent recorded but not yet opened into a distribution epoch.
    #[external("utility")]
    unconstrained fn get_undistributed_rent() -> pub u64 {
        self.storage.undistributed_rent.read()
    }

    #[external("utility")]
    unconstrained fn get_total_rent_claimed() -> pub u64 {
        self.storage.total_rent_claimed.read()
    }

    // Rent still held by the fund: collected minus paid out. Surfaced separately
    // from NAV (NAV = total_deposits, pooled capital only); uses this running
    // balance, not the lifetime total, so claimed rent that has left the fund is
    // not double counted.
    #[external("utility")]
    unconstrained fn get_rent_in_fund() -> pub u64 {
        let income = self.storage.total_rent_income.read();
        let claimed = self.storage.total_rent_claimed.read();
        if claimed >= income {
            0
        } else {
            income - claimed
        }
    }

    // -- Capped-return (ROR) getters --------------------------------------

    #[external("utility")]
    unconstrained fn get_ror_bps() -> pub u64 {
        self.storage.ror_bps.read()
    }

    #[external("utility")]
    unconstrained fn get_acquisition_value(property_id: u32) -> pub u64 {
        self.storage.acquisition_value_by_property.at(property_id as Field).read()
    }

    // Expected ANNUAL rent for a property = ROR * acquisition_value (cost-based,
    // fully to investors). Integer math via a u128 intermediate (no overflow),
    // floored to whole EUR. Zero if ROR or the acquisition value is unset.
    #[external("utility")]
    unconstrained fn get_expected_annual_rent(property_id: u32) -> pub u64 {
        let acq = self.storage.acquisition_value_by_property.at(property_id as Field).read() as u128;
        let bps = self.storage.ror_bps.read() as u128;
        ((acq * bps) / 10000) as u64
    }

    // Expected MONTHLY rent = expected annual / 12 (floored).
    #[external("utility")]
    unconstrained fn get_expected_monthly_rent(property_id: u32) -> pub u64 {
        let acq = self.storage.acquisition_value_by_property.at(property_id as Field).read() as u128;
        let bps = self.storage.ror_bps.read() as u128;
        (((acq * bps) / 10000) / 12) as u64
    }

    // -- Withdraw-vs-reinvest ledger getters (public path) ----------------

    #[external("utility")]
    unconstrained fn get_rent_withdrawn(user: AztecAddress) -> pub u64 {
        self.storage.rent_withdrawn_by.at(user).read()
    }

    #[external("utility")]
    unconstrained fn get_rent_reinvested(user: AztecAddress) -> pub u64 {
        self.storage.rent_reinvested_by.at(user).read()
    }

    // Per-rent-epoch snapshot (reuses the DistributionStatus shape).
    #[external("utility")]
    unconstrained fn get_rent_distribution_status(rent_epoch_id: u32) -> pub DistributionStatus {
        let rid = rent_epoch_id as Field;
        DistributionStatus {
            open: self.storage.r_open.at(rid).read(),
            amount: self.storage.r_amount.at(rid).read(),
            snapshot_total: self.storage.r_snapshot_total.at(rid).read(),
            small_total: self.storage.r_small_total.at(rid).read(),
            small_pool: self.storage.r_small_pool.at(rid).read(),
            fifo_cap: self.storage.r_fifo_cap.at(rid).read(),
            claimed_total: self.storage.r_claimed_total.at(rid).read(),
        }
    }

    // Public-path claimable-rent preview for a deposit record (by global seq).
    #[external("utility")]
    unconstrained fn get_claimable_rent(rent_epoch_id: u32, user: AztecAddress, seq: u64) -> pub u128 {
        let rid = rent_epoch_id as Field;
        let is_open = self.storage.r_open.at(rid).read();
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, rid]);
        let has_claimed = self.storage.r_record_has_claimed.at(claim_key).read();
        let rec = self.storage.deposit_records.at(poseidon2_hash([user.to_field(), seq as Field])).read();

        if !is_open | has_claimed | (rec.owner != user) | (rec.amount == 0) {
            0
        } else {
            let small_pool = self.storage.r_small_pool.at(rid).read();
            let small_total = self.storage.r_small_total.at(rid).read();
            let fifo_cap = self.storage.r_fifo_cap.at(rid).read();
            total_claim(rec.amount, rec.cum_before, rec.is_small, small_pool, small_total, fifo_cap)
        }
    }

    #[external("utility")]
    unconstrained fn has_claimed_rent(rent_epoch_id: u32, user: AztecAddress, seq: u64) -> pub bool {
        let rid = rent_epoch_id as Field;
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, rid]);
        self.storage.r_record_has_claimed.at(claim_key).read()
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
