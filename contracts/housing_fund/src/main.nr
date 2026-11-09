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
    use deposit_note::{DepositNote, withdraw_marker_nullifier};
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
        messages::delivery::MessageDelivery,
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
    // Upper bound on public DepositRecords retracted per withdraw() (H2). A public
    // depositor whose withdrawal spans more than this many of their own records must
    // split the withdrawal; the loop is bounded for the public VM.
    // Records drained per withdraw call. Deliberately small: each drained
    // record is a multi-slot public write, and the AVM caps data writes per tx
    // (the previous value of 64 could never actually execute -- draining 64
    // records blows the SSTORE budget). With the H2b cursor, splitting a wide
    // withdrawal across calls is sound: each call drains up to this many
    // records and the cursor slides forward.
    global MAX_WITHDRAW_RECORDS: u32 = 8;
    // J4: funding-queue candidates examined per match_next crank. Each
    // candidate costs up to 4 cross-contract view frames, so the window is
    // deliberately small; the head cursor slides it forward across cranks.
    global MAX_MATCH_SCAN: u32 = 8;

    #[derive(Serialize, Deserialize)]
    pub struct FundStatsView {
        pub total_deposits: u64,
        pub total_in_defi: u64,
        pub total_allocated: u64,
        pub available: u64,
    }

    #[derive(Serialize, Deserialize, Packable, Eq)]
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
        // Block at which the distribution snapshot was taken (set when the
        // distribution opens). A PRIVATE claimer must supply this as
        // `supplied_snapshot_block` to claim_distribution_private (the private
        // circuit cannot read public storage, so it is supplied here and
        // re-verified against the stored snapshot block in the public tail).
        // For the rent-epoch variant (get_rent_distribution_status) this is the
        // rent epoch's r_snapshot_block.
        pub snapshot_block: u32,
    }

    // The public deposit/allocation cursors a PXE caller must read to supply the
    // stamping params for a private deposit (supplied-then-verified).
    #[derive(Serialize, Deserialize, Packable, Eq)]
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

    #[derive(Serialize, Deserialize, Packable, Eq)]
    pub struct ParkedCapitalPolicy {
        pub target_bps: u32,
        pub min_bps: u32,
        pub max_bps: u32,
    }

    // -- Packed storage groups ------------------------------------------------
    // STORAGE GROUPING (aztec-nr v6 / Noir 1.0): the `#[aztec]` macro builds one
    // generic self type over the whole Storage struct, and the Noir compiler
    // caps that type's size (MAX_TYPE_COMPLEXITY = 100k nodes) in every PRIVATE
    // function. Each `PublicMutable` field costs ~2 PrivateContext expansions
    // and each `Map` ~4, so the old 65-field layout (~210 units) was far over the
    // ~75-unit budget. Related scalars are packed into one struct per slot group
    // (fund links / totals / cursor / valuation / parked policy / rent totals;
    // one record per distribution, rent epoch, property and public-path user).
    // Each group is read-modify-written as a unit. The external ABI is unchanged.
    #[derive(Packable, Eq)]
    pub struct FundLinks {
        pub admin: AztecAddress,
        pub kyc_verifier: AztecAddress,
        pub fund_token: AztecAddress,
        pub defi_vault: AztecAddress,
        pub governance: AztecAddress,
        // AIP-721 property-deed NFT (this fund is its minter). Optional: when
        // unset, distribution still works and no deed is minted.
        pub property_nft: AztecAddress,
        // Optional keeper allowed to post rent (in addition to admin). An oracle
        // /keeper that reports collected rent per property. Zero = admin-only.
        pub rent_keeper: AztecAddress,
        // The EUR stablecoin the fund pays rent yield from (its own public
        // balance). Set via set_eur_token; zero until wired.
        pub eur_token: AztecAddress,
    }

    // Fund accounting (all public -- transparent to investors). total_deposits
    // is NET of withdrawals and bounds available balance.
    #[derive(Packable, Eq)]
    pub struct FundTotals {
        pub total_deposits: u64,
        pub total_in_defi: u64,
        pub total_allocated: u64,
        // Investor registry size (public-path depositors only).
        pub investor_count: u32,
        // Emergency pause
        pub is_paused: bool,
    }

    // Rent aggregates. NOT part of NAV: NAV = total_deposits (pooled capital
    // only); rent is surfaced separately as a claimable yield and never
    // inflates share value.
    #[derive(Packable, Eq)]
    pub struct RentTotals {
        // Cumulative rent income recorded across all properties (lifetime,
        // gross EUR units).
        pub total_rent_income: u64,
        // Rent recorded but not yet opened into a rent-distribution epoch.
        pub undistributed_rent: u64,
        // Lifetime rent paid out to holders. Rent still in the fund is
        // total_rent_income - total_rent_claimed (claimed rent has left the fund).
        pub total_rent_claimed: u64,
        // Return on Rent in basis points (e.g. 300 = 3%). Rent is defined as
        // ROR * acquisition_value -- the cost-based, below-market rent that flows
        // FULLY to investors (the "cap" is cost-based rent, not a reserve skim;
        // see CLAUDE.md "Economic model"). The keeper still posts ACTUAL collected
        // rent via record_rent; ROR drives the EXPECTED/billed rent (get_expected_*).
        // 0 = unset: expected rent reads 0 until an admin configures it.
        pub ror_bps: u64,
    }

    // One snapshot per proposal distribution (FSFT, `distributions`) or rent
    // epoch (EUR, `rent_epochs`); all amounts in u128 units. `snapshot_block` is
    // the block at which open_distribution / open_rent_distribution snapshotted
    // the deposit set (H1/H3): private claims prove their note existed and was
    // not withdrawn as of that block. `dust` is the structural undistributable
    // remainder at open (audit; fifo under-subscription + the whole small_pool
    // when there are no small depositors).
    #[derive(Packable, Eq)]
    pub struct EpochSnapshot {
        pub open: bool,
        pub amount: u128,
        pub snapshot_total: u128,
        pub small_total: u128,
        pub small_pool: u128,
        pub fifo_cap: u128,
        pub claimed_total: u128,
        pub dust: u128,
        pub snapshot_block: u32,
    }

    // Per-property record, keyed by property_id (== proposal_id by convention --
    // the property a rent is posted against is the proposal that funded it).
    #[derive(Packable, Eq)]
    pub struct PropertyRecord {
        // Cumulative rent recorded for the property.
        pub rent_income: u64,
        // Acquisition value (whole EUR); expected rent = ROR * this.
        pub acquisition_value: u64,
        // W1: affordability covenant synced from governance. An unsynced
        // property reads covenant_set == false (no enforcement). record_rent
        // caps keeper-posted rent against this.
        pub covenant_set: bool,
        pub rent_ceiling_bps: u32,
        pub lock_years: u32,
    }

    // Public-path per-user record (private depositors never register here).
    #[derive(Packable, Eq)]
    pub struct UserRecord {
        // Number of public deposit records (indexed via user_deposit_seq).
        pub deposit_count: u32,
        // Investor registry membership (investor_index position assigned once).
        pub investor_seen: bool,
        // Aggregate deposit ticket (used by legacy public withdraw).
        pub deposit_ticket: u64,
        // Withdraw-vs-reinvest ledger (PUBLIC path only): lifetime rent taken
        // as fiat (claim_rent) vs reinvested back into the fund (reinvest_rent).
        // The private claim paths cannot attribute per-holder without leaking
        // identity; private claimants track their own off-chain.
        pub rent_withdrawn: u64,
        pub rent_reinvested: u64,
        // H2b: index of the first public record that may still hold balance.
        // Advances past the fully-drained prefix on each withdraw so the H2
        // retraction loop scans [cursor, cursor + MAX_WITHDRAW_RECORDS).
        pub withdraw_cursor: u32,
    }

    // Domain tags for the shared claim maps (`record_claims`, `claims`): the
    // distribution and rent-epoch keys share an id space (proposal_id /
    // rent_epoch_id are both small integers), so each key carries its domain.
    global CLAIM_DOMAIN_DISTRIBUTION: Field = 1;
    global CLAIM_DOMAIN_RENT: Field = 2;
    global CLAIM_DOMAIN_WITHDRAW: Field = 3;

    #[storage]
    struct Storage<Context> {
        links: PublicMutable<FundLinks, Context>,
        totals: PublicMutable<FundTotals, Context>,
        // FIFO / allocation cursors (gross, monotonic, u128, NEVER decremented).
        // cum_deposits gives every deposit its immutable FIFO interval; the
        // small/threshold cursor feeds the small-pool denominator.
        cursor: PublicMutable<DepositCursor, Context>,
        // Latest valuation snapshot from executed asset sale.
        valuation: PublicMutable<Valuation, Context>,
        // Parked-capital policy for idle EUR allocations (basis points).
        parked: PublicMutable<ParkedCapitalPolicy, Context>,
        rent: PublicMutable<RentTotals, Context>,
        // Public-path per-deposit records, keyed poseidon2([owner, seq]).
        deposit_records: Map<Field, PublicMutable<DepositRecord, Context>, Context>,
        // Per-user enumeration of public deposit seqs so a caller can list their
        // claimable records: indexed seq map keyed poseidon2([owner, idx]) (count
        // lives in UserRecord.deposit_count).
        user_deposit_seq: Map<Field, PublicMutable<u64, Context>, Context>,
        // Investor registry (public-path depositors, by registration index).
        investor_index: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        users: Map<AztecAddress, PublicMutable<UserRecord, Context>, Context>,
        // Per-proposal distribution snapshots (FSFT) and per-rent-epoch
        // snapshots (EUR yield), same shape.
        distributions: Map<Field, PublicMutable<EpochSnapshot, Context>, Context>,
        rent_epochs: Map<Field, PublicMutable<EpochSnapshot, Context>, Context>,
        // Public-path anti-double-claim, keyed
        // poseidon2([owner, seq, proposal_id | rent_epoch_id, CLAIM_DOMAIN_*]).
        record_claims: Map<Field, PublicMutable<bool, Context>, Context>,
        properties: Map<Field, PublicMutable<PropertyRecord, Context>, Context>,
        // V2 private deposits: each owner's PXE holds their own DepositNote set.
        deposit_notes: Owned<PrivateSet<DepositNote, Context>, Context>,
        // V2 single-use claims, owner-siloed, keyed
        //   poseidon2([note_hash, proposal_id, CLAIM_DOMAIN_DISTRIBUTION])
        //   (claim_distribution_private: once per (deposit_note, proposal)),
        //   poseidon2([note_hash, CLAIM_DOMAIN_WITHDRAW]) (withdraw_private), and
        //   poseidon2([note_hash, rent_epoch_id, CLAIM_DOMAIN_RENT])
        //   (claim_rent_private / reinvest_rent_private: once per (note, epoch)).
        claims: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
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
    // withdraw paths) uses the identical subtraction order.
    //
    // FAIL-CLOSED, NOT SATURATING: Noir u64 subtraction REVERTS on underflow (it
    // does NOT clamp to 0 -- WrappingSub is the explicit opt-in and is not used
    // here). So if encumbrances ever exceed deposits this traps the tx rather
    // than returning a misleading 0; callers must not assume a 0-floor. Native
    // checked arithmetic already does the range check -- do not add a manual one.
    // Pure helper -- caller reads the three aggregates and passes them.
    #[contract_library_method]
    fn available_balance(deposits: u64, in_defi: u64, allocated: u64) -> u64 {
        deposits - in_defi - allocated
    }

    // View projection of a stored snapshot (drops the audit-only `dust` field so
    // the returned DistributionStatus shape is unchanged for callers).
    #[contract_library_method]
    fn snapshot_status(snapshot: EpochSnapshot) -> DistributionStatus {
        DistributionStatus {
            open: snapshot.open,
            amount: snapshot.amount,
            snapshot_total: snapshot.snapshot_total,
            small_total: snapshot.small_total,
            small_pool: snapshot.small_pool,
            fifo_cap: snapshot.fifo_cap,
            claimed_total: snapshot.claimed_total,
            snapshot_block: snapshot.snapshot_block,
        }
    }

    // H1: the per-note withdraw marker moved to the deposit_note lib (one
    // definition next to DepositNote) so Governance can recompute it for the
    // stale-note vote check. Imported above as withdraw_marker_nullifier.

    #[initializer]
    #[external("public")]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        // rent_keeper / eur_token / acquisition values intentionally left unset
        // (zero) until wired by the admin/keeper.
        self.storage.links.write(FundLinks {
            admin,
            kyc_verifier: AztecAddress::zero(),
            fund_token: AztecAddress::zero(),
            defi_vault: AztecAddress::zero(),
            governance: AztecAddress::zero(),
            property_nft: AztecAddress::zero(),
            rent_keeper: AztecAddress::zero(),
            eur_token: AztecAddress::zero(),
        });
        self.storage.totals.write(FundTotals {
            total_deposits: 0,
            total_in_defi: 0,
            total_allocated: 0,
            investor_count: 0,
            is_paused: false,
        });
        self.storage.cursor.write(DepositCursor {
            cum_deposits: 0,
            cum_small_deposits: 0,
            deposit_seq: 0,
            small_threshold: DEFAULT_SMALL_THRESHOLD,
        });
        self.storage.valuation.write(Valuation {
            last_asset_sale_price: 0,
            last_fsft_minted: 0,
            last_token_price_bps: 0,
            last_valuation_block: 0,
        });
        self.storage.parked.write(ParkedCapitalPolicy { target_bps: 3000, min_bps: 2000, max_bps: 5000 });
        self.storage.rent.write(RentTotals {
            total_rent_income: 0,
            undistributed_rent: 0,
            total_rent_claimed: 0,
            ror_bps: 0,
        });
    }

    // -- Contract wiring (called after all contracts are deployed) ---------

    #[external("public")]
    fn set_contracts(
        kyc_verifier: AztecAddress,
        fund_token: AztecAddress,
        defi_vault: AztecAddress,
        governance: AztecAddress,
    ) {
        let mut links = self.storage.links.read();
        assert_eq(self.msg_sender(), links.admin, "not admin");
        links.kyc_verifier = kyc_verifier;
        links.fund_token = fund_token;
        links.defi_vault = defi_vault;
        links.governance = governance;
        self.storage.links.write(links);
    }

    // Wire the AIP-721 property-deed NFT (deployed with this fund as its minter).
    // Kept separate from set_contracts to avoid changing that function's arity.
    #[external("public")]
    fn set_property_nft(property_nft: AztecAddress) {
        let mut links = self.storage.links.read();
        assert_eq(self.msg_sender(), links.admin, "not admin");
        links.property_nft = property_nft;
        self.storage.links.write(links);
    }

    // Admin-only: adjust the small-depositor cutoff. Only affects FUTURE
    // deposits -- each deposit's is_small bit is frozen at deposit time.
    #[external("public")]
    fn set_small_threshold(threshold: u128) {
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");
        let mut cursor = self.storage.cursor.read();
        cursor.small_threshold = threshold;
        self.storage.cursor.write(cursor);
    }

    // Admin: designate a keeper allowed to post collected rent (an oracle/keeper
    // that reports rent per property). Zero address = admin-only.
    #[external("public")]
    fn set_rent_keeper(keeper: AztecAddress) {
        let mut links = self.storage.links.read();
        assert_eq(self.msg_sender(), links.admin, "not admin");
        links.rent_keeper = keeper;
        self.storage.links.write(links);
    }

    // Admin: set the fund-level Return on Rent (ROR) in basis points. Rent is
    // defined as ROR * acquisition_value (cost-based, below market, fully to
    // investors), so this is the master return parameter. Capped at 100% (10000
    // bps) as a sanity bound.
    #[external("public")]
    fn set_ror_bps(bps: u64) {
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");
        assert(bps <= 10000, "ror bps out of range");
        let mut rent = self.storage.rent.read();
        rent.ror_bps = bps;
        self.storage.rent.write(rent);
    }

    // Admin or keeper: record a property's acquisition value (whole EUR). The
    // expected rent for the property is ROR * acquisition_value (get_expected_*).
    #[external("public")]
    fn set_acquisition_value(property_id: u32, value: u64) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        let admin = links.admin;
        let keeper = links.rent_keeper;
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to set acquisition value",
        );
        let pkey = property_id as Field;
        let mut property = self.storage.properties.at(pkey).read();
        property.acquisition_value = value;
        self.storage.properties.at(pkey).write(property);
    }

    // -- Core operations --------------------------------------------------

    #[external("public")]
    fn deposit(amount: u64) {
        let mut totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        assert(amount > 0, "amount must be positive");
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.links.read().kyc_verifier);
        // PRIVACY NOTE (M15): this public `is_investor(caller)` check publicly
        // confirms the caller's KYC status (transparency mode). The privacy-
        // preserving everyday path is `deposit_private`, which attests a hinted
        // KYC credential without exposing the caller on the public boundary.
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "investor role required");

        let amount_u128 = amount as u128;

        // Stamp the deposit's immutable FIFO interval + frozen small bit, and
        // write a per-deposit public record (the claim basis for the public path).
        let mut cursor = self.storage.cursor.read();
        let cum_before = cursor.cum_deposits;
        let seq = cursor.deposit_seq;
        let is_small = amount_u128 <= cursor.small_threshold;

        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        self.storage.deposit_records.at(rec_key).write(DepositRecord {
            owner: caller,
            amount: amount_u128,
            cum_before,
            is_small,
        });

        // Per-user enumeration so a caller can list their public records.
        let mut user = self.storage.users.at(caller).read();
        let dcount = user.deposit_count;
        self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), dcount as Field])).write(
            seq,
        );
        user.deposit_count = dcount + 1;

        // Advance the global cursors.
        cursor.cum_deposits = cum_before + amount_u128;
        if is_small {
            cursor.cum_small_deposits += amount_u128;
        }
        cursor.deposit_seq = seq + 1;
        self.storage.cursor.write(cursor);

        // Legacy aggregate ticket + investor registry (used by public withdraw).
        let previous_ticket = user.deposit_ticket;
        if previous_ticket == 0 {
            if !user.investor_seen {
                let next_index = totals.investor_count;
                self.storage.investor_index.at(next_index as Field).write(caller);
                totals.investor_count = next_index + 1;
                user.investor_seen = true;
            }
        }
        user.deposit_ticket = previous_ticket + amount;
        self.storage.users.at(caller).write(user);

        totals.total_deposits += amount;
        self.storage.totals.write(totals);
    }

    #[external("public")]
    fn withdraw(amount: u64) {
        let mut totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        assert(amount > 0, "amount must be positive");
        let caller = self.msg_sender();
        let mut user = self.storage.users.at(caller).read();
        let ticket = user.deposit_ticket;
        assert(amount <= ticket, "insufficient deposit ticket");

        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        assert(amount <= available, "insufficient available balance");

        user.deposit_ticket = ticket - amount;
        totals.total_deposits -= amount;
        self.storage.totals.write(totals);

        // H2: retract this caller's public DepositRecords FIFO (oldest first) so a
        // withdrawn public depositor stops minting FSFT / claiming rent on principal
        // they pulled out. cum_deposits stays monotonic (the global FIFO axis is
        // shared and must not shift other depositors' intervals); we only SHRINK
        // this caller's own record amounts, which can never increase any claim, so
        // the "sum of claims <= pool" tiling invariant is preserved (fail-closed:
        // the freed FIFO/small capacity simply becomes dust). The sum of a caller's
        // record amounts always equals their deposit_tickets, so `remaining` reaches
        // zero unless the withdrawal spans more than MAX_WITHDRAW_RECORDS live
        // records in one call (split the withdrawal in that case).
        //
        // H2b: the scan starts at the caller's cursor (first possibly-live record),
        // not index 0 -- a fixed [0, 64) window made balance in records >= 64
        // permanently unwithdrawable once the first 64 drained. The cursor only
        // advances past records that are empty NOW (deposits only append), so
        // skipped records can never hold balance.
        let mut remaining = amount as u128;
        let count = user.deposit_count;
        let start = user.withdraw_cursor;
        let mut new_start = start;
        let mut prefix_live = false; // set once a still-live record is seen
        for i in 0..MAX_WITHDRAW_RECORDS {
            let idx = start + i;
            if idx < count {
                let seq = self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), idx as Field])).read();
                let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
                let rec = self.storage.deposit_records.at(rec_key).read();
                let mut post_amount = rec.amount;
                if (rec.amount > 0) & (remaining > 0) {
                    let reduce = if remaining < rec.amount { remaining } else { rec.amount };
                    post_amount = rec.amount - reduce;
                    self.storage.deposit_records.at(rec_key).write(DepositRecord {
                        owner: rec.owner,
                        amount: post_amount,
                        cum_before: rec.cum_before,
                        is_small: rec.is_small,
                    });
                    remaining -= reduce;
                }
                if !prefix_live {
                    if post_amount == 0 {
                        new_start = idx + 1;
                    } else {
                        prefix_live = true;
                    }
                }
            }
        }
        assert(remaining == 0, "withdraw spans too many records");
        user.withdraw_cursor = new_start;
        self.storage.users.at(caller).write(user);
    }

    // -- DeFi management --------------------------------------------------

    #[external("public")]
    fn deploy_to_defi(amount: u64) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        assert(links.admin.eq(caller) | links.governance.eq(caller), "not authorized");

        let mut totals = self.storage.totals.read();
        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        assert(amount <= available, "insufficient available balance");

        totals.total_in_defi += amount;
        self.storage.totals.write(totals);
    }

    #[external("public")]
    fn withdraw_from_defi(amount: u64) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        assert(links.admin.eq(caller) | links.governance.eq(caller), "not authorized");

        let mut totals = self.storage.totals.read();
        assert(amount <= totals.total_in_defi, "exceeds defi balance");

        totals.total_in_defi -= amount;
        self.storage.totals.write(totals);
    }

    #[external("public")]
    fn set_parked_capital_policy(target_bps: u32, min_bps: u32, max_bps: u32) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        assert(links.admin.eq(caller) | links.governance.eq(caller), "not authorized");

        assert(max_bps <= 10000, "max bps out of range");
        assert(min_bps <= max_bps, "invalid min/max policy");
        assert((target_bps >= min_bps) & (target_bps <= max_bps), "target outside policy range");

        self.storage.parked.write(ParkedCapitalPolicy { target_bps, min_bps, max_bps });
    }

    // -- Governance: Property reservation ---------------------------------

    #[external("public")]
    fn reserve_for_property(amount: u64) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        assert(
            links.governance.eq(caller) | links.admin.eq(caller),
            "only governance or admin can reserve",
        );

        let mut totals = self.storage.totals.read();
        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        assert(amount <= available, "insufficient available balance");

        totals.total_allocated += amount;
        self.storage.totals.write(totals);
    }

    // -- J4: permissionless priority matching (journey step 4) ---------------
    //
    // Funds the best PASSED listing-backed proposal the fund can afford:
    // highest council quality score, then deepest covenant discount, then
    // FIFO (see Governance.get_proposal_priority_public). Anyone may crank
    // this; authority comes from the vote (PASSED) and the balance check, not
    // the caller. Lives here rather than in Governance because the dependency
    // edge is housing_fund -> governance (the reverse import would be
    // circular), and the money checks are local reads this way.

    #[external("public")]
    fn match_next() {
        let totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        let gov = Governance::at(self.storage.links.read().governance);
        let head = self.view(gov.get_funding_queue_head_public());
        let tail = self.view(gov.get_funding_queue_tail_public());
        assert(head < tail, "funding queue is empty");

        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);

        // Bounded scan window; entries beyond it wait for the next crank
        // (head advances past settled prefixes, so the window slides).
        let mut found = false;
        let mut best_pid: u32 = 0;
        let mut best_amount: u64 = 0;
        let mut best_priority: u64 = 0;
        let mut new_head = head;
        let mut prefix_live = false;
        for i in 0..MAX_MATCH_SCAN {
            let idx = head + i;
            if idx < tail {
                let pid = self.view(gov.get_funding_queue_entry_public(idx));
                let status = self.view(gov.get_proposal_status_public(pid));
                if status == 1 {
                    // PASSED and still awaiting funding: the head must not
                    // advance past a live entry, funded or not this round.
                    prefix_live = true;
                    let amount = self.view(gov.get_proposal_amount_public(pid));
                    if amount <= available {
                        let priority = self.view(gov.get_proposal_priority_public(pid));
                        // Strictly greater displaces: FIFO wins ties.
                        if (!found) | (priority > best_priority) {
                            found = true;
                            best_pid = pid;
                            best_amount = amount;
                            best_priority = priority;
                        }
                    }
                } else if !prefix_live {
                    // Settled (EXECUTED via a prior match or admin path).
                    new_head = idx + 1;
                }
            }
        }
        assert(found, "no fundable proposal in queue");

        // Flip PASSED -> EXECUTED on governance and advance the queue head.
        self.call(gov.mark_matched(best_pid, new_head));

        // Record the acquisition at the ask (property_id == proposal_id by
        // convention) so rent expectations and covenant enforcement bind to
        // the funded value immediately.
        let pkey = best_pid as Field;
        let mut property = self.storage.properties.at(pkey).read();
        property.acquisition_value = best_amount;
        self.storage.properties.at(pkey).write(property);

        // Bind the voted covenant to enforcement at funding time. record_rent's
        // ceiling only engages once the covenant is synced into the fund, and
        // no keeper was cranking sync_proposal_covenant -- matching is the
        // moment the property becomes rentable, so the terms bind here.
        // Conditional because sync reverts on covenant-less proposals.
        let cov_set = self.view(gov.get_proposal_covenant_set_public(best_pid));
        if cov_set {
            self.call(
                HousingFund::at(self.context.this_address()).sync_proposal_covenant(best_pid),
            );
        }

        // Reserve + snapshot via the existing permissionless lifecycle (its
        // own available-balance and double-open guards still apply).
        self.call(HousingFund::at(self.context.this_address()).open_distribution(best_pid));
    }

    // -- Permissionless settlement + investor claims ------------------------

    #[external("public")]
    fn open_distribution(proposal_id: u32) {
        let pid = proposal_id as Field;
        assert(!self.storage.distributions.at(pid).read().open, "distribution already opened");

        let links = self.storage.links.read();
        let gov = Governance::at(links.governance);
        let status = self.view(gov.get_proposal_status_public(proposal_id));
        assert(status == 3, "proposal is not executed");

        let proposal_amount = self.view(gov.get_proposal_amount_public(proposal_id));
        assert(proposal_amount > 0, "invalid proposal amount");

        let mut totals = self.storage.totals.read();
        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        assert(proposal_amount <= available, "insufficient available balance");

        totals.total_allocated += proposal_amount;
        self.storage.totals.write(totals);

        // Distribution snapshot. proposal_amount is u64, so pool fits u64 (no
        // overflow guard needed); all allocation math is u128.
        let pool = proposal_amount as u128;
        let cursor = self.storage.cursor.read();
        let snapshot_total = cursor.cum_deposits;
        assert(snapshot_total > 0, "no deposits to distribute");
        let small_total = cursor.cum_small_deposits;
        let small_pool = (pool * SMALL_POOL_BPS) / 10000;
        let fifo_pool = pool - small_pool;
        let fifo_cap = fifo_pool;

        // Structural dust (audit): FIFO under-subscription + whole small_pool if
        // there are no small depositors.
        let fifo_filled = if snapshot_total < fifo_cap { snapshot_total } else { fifo_cap };
        let fifo_dust = fifo_cap - fifo_filled;
        let small_dust_max = if small_total == 0 { small_pool } else { 0 };

        // H1/H3: the snapshot block is recorded so private claims can bind to it.
        self.storage.distributions.at(pid).write(EpochSnapshot {
            open: true,
            amount: pool,
            snapshot_total,
            small_total,
            small_pool,
            fifo_cap,
            claimed_total: 0,
            dust: fifo_dust + small_dust_max,
            snapshot_block: self.context.block_number(),
        });

        // Issue-time pricing snapshot: used as reference, not hard peg.
        self.storage.valuation.write(Valuation {
            last_asset_sale_price: proposal_amount,
            last_fsft_minted: proposal_amount,
            last_token_price_bps: 10000,
            last_valuation_block: self.context.block_number(),
        });

        // Record the asset acquisition on-chain by minting a property-deed NFT
        // (AIP-721) to the fund. token_id = proposal_id + 1 because the NFT
        // contract reserves token_id 0. No-op if the NFT is not wired up.
        let nft_addr = links.property_nft;
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
        let mut dist = self.storage.distributions.at(pid).read();
        assert(dist.open, "distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        // H3: bind the claim to the snapshot. A record created AFTER the
        // distribution was opened (cum_before+amount beyond the snapshot total)
        // never participated in that pool and must not dilute it.
        assert(rec.cum_before + rec.amount <= dist.snapshot_total, "deposit not in snapshot");

        let claim_key =
            poseidon2_hash([caller.to_field(), seq as Field, pid, CLAIM_DOMAIN_DISTRIBUTION]);
        assert(!self.storage.record_claims.at(claim_key).read(), "already claimed");

        let claim = total_claim(
            rec.amount,
            rec.cum_before,
            rec.is_small,
            dist.small_pool,
            dist.small_total,
            dist.fifo_cap,
        );
        assert(claim > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        assert(dist.claimed_total + claim <= dist.amount, "distribution exhausted");

        let fund_token = Token::at(self.storage.links.read().fund_token);
        self.call(fund_token.mint_to_public(caller, claim));

        dist.claimed_total += claim;
        self.storage.distributions.at(pid).write(dist);
        self.storage.record_claims.at(claim_key).write(true);
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
        let links = self.storage.links.read();
        let admin = links.admin;
        let keeper = links.rent_keeper;
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to open rent distribution",
        );

        let rid = rent_epoch_id as Field;
        assert(!self.storage.rent_epochs.at(rid).read().open, "rent distribution already opened");
        assert(amount > 0, "amount must be positive");

        let mut rent = self.storage.rent.read();
        assert(amount <= rent.undistributed_rent, "amount exceeds undistributed rent");

        let cursor = self.storage.cursor.read();
        let snapshot_total = cursor.cum_deposits;
        assert(snapshot_total > 0, "no deposits to distribute to");

        let pool = amount as u128;
        let small_total = cursor.cum_small_deposits;
        let small_pool = (pool * SMALL_POOL_BPS) / 10000;
        let fifo_cap = pool - small_pool;

        // H1/H3: the snapshot block is recorded so private rent claims can bind to it.
        self.storage.rent_epochs.at(rid).write(EpochSnapshot {
            open: true,
            amount: pool,
            snapshot_total,
            small_total,
            small_pool,
            fifo_cap,
            claimed_total: 0,
            dust: 0,
            snapshot_block: self.context.block_number(),
        });

        rent.undistributed_rent -= amount;
        self.storage.rent.write(rent);
    }

    // Public-path rent claim for a SPECIFIC deposit record (by global seq), paid
    // in EUR. Mirrors claim_distribution but transfers EUR instead of minting FSFT.
    #[external("public")]
    fn claim_rent(rent_epoch_id: u32, seq: u64) {
        let rid = rent_epoch_id as Field;
        let mut epoch = self.storage.rent_epochs.at(rid).read();
        assert(epoch.open, "rent distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        // H3: bind to the snapshot -- a deposit made after the epoch opened did
        // not back this rent and must not dilute the per-epoch pool.
        assert(rec.cum_before + rec.amount <= epoch.snapshot_total, "deposit not in snapshot");

        let claim_key = poseidon2_hash([caller.to_field(), seq as Field, rid, CLAIM_DOMAIN_RENT]);
        assert(!self.storage.record_claims.at(claim_key).read(), "already claimed");

        let share = total_claim(
            rec.amount,
            rec.cum_before,
            rec.is_small,
            epoch.small_pool,
            epoch.small_total,
            epoch.fifo_cap,
        );
        assert(share > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        assert(epoch.claimed_total + share <= epoch.amount, "rent distribution exhausted");

        // Pay EUR yield from the fund's own public balance to the claimant. The
        // fund is msg_sender == from, so the transfer is self-authorized (nonce 0).
        // Reverts if the fund holds insufficient EUR (fail-closed, never silent).
        let eur = self.storage.links.read().eur_token;
        assert(!eur.is_zero(), "eur token not set");
        self.call(Token::at(eur).transfer_public_to_public(self.context.this_address(), caller, share, 0));

        epoch.claimed_total += share;
        self.storage.rent_epochs.at(rid).write(epoch);
        self.storage.record_claims.at(claim_key).write(true);
        let mut rent = self.storage.rent.read();
        rent.total_rent_claimed += share as u64;
        self.storage.rent.write(rent);
        // Ledger: rent this holder took as fiat (the withdraw side of the
        // withdraw-vs-reinvest choice).
        let mut user = self.storage.users.at(caller).read();
        user.rent_withdrawn += share as u64;
        self.storage.users.at(caller).write(user);
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
        let mut totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        let rid = rent_epoch_id as Field;
        let mut epoch = self.storage.rent_epochs.at(rid).read();
        assert(epoch.open, "rent distribution is not open");

        let caller = self.msg_sender();
        let rec_key = poseidon2_hash([caller.to_field(), seq as Field]);
        let rec = self.storage.deposit_records.at(rec_key).read();
        assert(rec.owner == caller, "no deposit record for caller/seq");
        assert(rec.amount > 0, "empty deposit record");

        // H3: bind to the snapshot -- a deposit made after the epoch opened did
        // not back this rent and must not dilute the per-epoch pool.
        assert(rec.cum_before + rec.amount <= epoch.snapshot_total, "deposit not in snapshot");

        let claim_key = poseidon2_hash([caller.to_field(), seq as Field, rid, CLAIM_DOMAIN_RENT]);
        assert(!self.storage.record_claims.at(claim_key).read(), "already claimed");

        let share = total_claim(
            rec.amount,
            rec.cum_before,
            rec.is_small,
            epoch.small_pool,
            epoch.small_total,
            epoch.fifo_cap,
        );
        assert(share > 0, "nothing to claim");

        // Fail-closed ceiling -- mathematically guaranteed by interval tiling.
        assert(epoch.claimed_total + share <= epoch.amount, "rent distribution exhausted");

        // Consume the rent claim and move it out of the rent pool.
        epoch.claimed_total += share;
        self.storage.rent_epochs.at(rid).write(epoch);
        self.storage.record_claims.at(claim_key).write(true);
        let mut rent = self.storage.rent.read();
        rent.total_rent_claimed += share as u64;
        self.storage.rent.write(rent);

        // Re-deposit the share as fresh capital for the caller (the usual deposit
        // route): stamp a new public deposit record at the current FIFO cursor,
        // advance the cursors, and bump the aggregates. `share` is bounded by the
        // rent pool (a u64 amount), so the u64 cast is safe.
        let share_u64 = share as u64;
        let mut cursor = self.storage.cursor.read();
        let cum_before = cursor.cum_deposits;
        let new_seq = cursor.deposit_seq;
        let is_small = share <= cursor.small_threshold;

        let new_rec_key = poseidon2_hash([caller.to_field(), new_seq as Field]);
        self.storage.deposit_records.at(new_rec_key).write(DepositRecord {
            owner: caller,
            amount: share,
            cum_before,
            is_small,
        });
        let mut user = self.storage.users.at(caller).read();
        let dcount = user.deposit_count;
        self.storage.user_deposit_seq.at(poseidon2_hash([caller.to_field(), dcount as Field])).write(
            new_seq,
        );
        user.deposit_count = dcount + 1;

        cursor.cum_deposits = cum_before + share;
        if is_small {
            cursor.cum_small_deposits += share;
        }
        cursor.deposit_seq = new_seq + 1;
        self.storage.cursor.write(cursor);

        let previous_ticket = user.deposit_ticket;
        if previous_ticket == 0 {
            if !user.investor_seen {
                let next_index = totals.investor_count;
                self.storage.investor_index.at(next_index as Field).write(caller);
                totals.investor_count = next_index + 1;
                user.investor_seen = true;
            }
        }
        user.deposit_ticket = previous_ticket + share_u64;

        totals.total_deposits += share_u64;
        self.storage.totals.write(totals);

        // Ledger: rent this holder reinvested (the reinvest side of the choice).
        user.rent_reinvested += share_u64;
        self.storage.users.at(caller).write(user);
    }

    // -- Governance/accounting: valuation snapshot ------------------------
    // Called after an executed proposal and FSFT distribution.
    #[external("public")]
    fn record_asset_sale(asset_sale_price: u64, minted_fsft: u64) {
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        assert(links.governance.eq(caller) | links.admin.eq(caller), "not authorized");
        assert(asset_sale_price > 0, "asset sale price must be positive");
        assert(minted_fsft > 0, "minted fsft must be positive");

        let token_price_bps = (asset_sale_price * 10000) / minted_fsft;
        self.storage.valuation.write(Valuation {
            last_asset_sale_price: asset_sale_price,
            last_fsft_minted: minted_fsft,
            last_token_price_bps: token_price_bps,
            last_valuation_block: self.context.block_number(),
        });
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
    // the "Economic model" section of CLAUDE.md.
    #[external("public")]
    fn record_rent(property_id: u32, amount: u64) {
        assert(!self.storage.totals.read().is_paused, "fund is paused");
        let caller = self.msg_sender();
        let links = self.storage.links.read();
        let admin = links.admin;
        let keeper = links.rent_keeper;
        assert(
            admin.eq(caller) | (!keeper.is_zero() & keeper.eq(caller)),
            "not authorized to record rent",
        );
        assert(amount > 0, "rent amount must be positive");

        let pkey = property_id as Field;
        let mut property = self.storage.properties.at(pkey).read();

        // W1c: enforce the affordability covenant. If a covenant has been synced
        // for this property and an acquisition value is known, the keeper cannot
        // book rent above the covenant's monthly ceiling
        // (acquisition_value * rent_ceiling_bps / 10000 / 12) -- the rent stays
        // affordable by construction. Properties with no synced covenant (or no
        // acquisition value) are unaffected, so this is fully backward-compatible.
        if property.covenant_set {
            let acq = property.acquisition_value;
            if acq > 0 {
                let ceiling_bps = property.rent_ceiling_bps;
                let monthly_cap = ((acq * ceiling_bps as u64) / 10000) / 12;
                assert(amount <= monthly_cap, "rent exceeds affordability covenant ceiling");
            }
        }

        property.rent_income += amount;
        self.storage.properties.at(pkey).write(property);

        let mut rent = self.storage.rent.read();
        rent.total_rent_income += amount;
        // Track the not-yet-distributed portion so a rent epoch can only hand out
        // rent that was actually collected.
        rent.undistributed_rent += amount;
        self.storage.rent.write(rent);
    }

    // -- W1: pull a proposal's affordability covenant into the fund ----------
    //
    // The covenant is immutable once a proposer attaches it on governance
    // (set_proposal_covenant, once-only). This copies it into the fund keyed by
    // property_id (== proposal_id by convention) so record_rent can enforce the
    // rent ceiling against a local read (no per-rent cross-contract call).
    // Permissionless and idempotent -- it only mirrors immutable, already-public
    // governance state. Reverts if the proposal has no covenant attached.
    #[external("public")]
    fn sync_proposal_covenant(proposal_id: u32) {
        let gov = Governance::at(self.storage.links.read().governance);
        let is_set = self.view(gov.get_proposal_covenant_set_public(proposal_id));
        assert(is_set, "proposal has no covenant");
        let ceiling_bps = self.view(gov.get_proposal_rent_ceiling_bps_public(proposal_id));
        let lock_years = self.view(gov.get_proposal_lock_years_public(proposal_id));

        let pkey = proposal_id as Field;
        let mut property = self.storage.properties.at(pkey).read();
        property.covenant_set = true;
        property.rent_ceiling_bps = ceiling_bps;
        property.lock_years = lock_years;
        self.storage.properties.at(pkey).write(property);
    }

    // -- W1: read the covenant the fund enforces for a property -------------
    #[external("utility")]
    unconstrained fn get_property_covenant(property_id: u32) -> pub (bool, u32, u32) {
        let property = self.storage.properties.at(property_id as Field).read();
        (property.covenant_set, property.rent_ceiling_bps, property.lock_years)
    }

    // Admin: wire the EUR stablecoin the fund pays rent yield from (its own
    // public balance). Required before any rent can be claimed.
    #[external("public")]
    fn set_eur_token(eur_token: AztecAddress) {
        let mut links = self.storage.links.read();
        assert_eq(self.msg_sender(), links.admin, "not admin");
        links.eur_token = eur_token;
        self.storage.links.write(links);
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
            MessageDelivery::onchain_constrained(),
        );

        // Compute the credential's revocation commitment from the note's packed
        // fields so the public tail can reject revoked credentials.
        //
        // PRIVACY NOTE (M12 -- known linkage): this commitment is the constant
        // handle `poseidon2([owner, nonce])`. The identical value is also
        // published by Governance.cast_vote_private's public tail, so an
        // on-chain observer can cluster the same user's deposits and votes by
        // matching the commitment field (the owner/nonce pre-image stays
        // private, but the equality of the published field is enough to link).
        // Fully closing this requires checking revocation privately -- migrate
        // KYCVerifier.revocations to DelayedPublicMutable (verify the pattern
        // against aztec-packages v4.3 first) -- or binding a per-action salt
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
        let mut totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        let kyc_addr = self.storage.links.read().kyc_verifier;
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        // Verify the supplied cursor matches the live public cursor (no lie, no
        // concurrent-deposit reorder), and that the supplied small bit matches
        // the recomputed classification from the kernel-verified amount.
        let mut cursor = self.storage.cursor.read();
        let cum_before = cursor.cum_deposits;
        let seq = cursor.deposit_seq;
        assert(supplied_cum_before == cum_before, "stale cum_before");
        assert(supplied_seq == seq, "stale seq");
        assert(supplied_is_small == (amount <= cursor.small_threshold), "is_small mismatch");

        // Advance the global cursors.
        cursor.cum_deposits = cum_before + amount;
        if supplied_is_small {
            cursor.cum_small_deposits += amount;
        }
        cursor.deposit_seq = seq + 1;
        self.storage.cursor.write(cursor);

        // Narrowing `as` casts WRAP in Noir (outside the checked-arithmetic
        // posture, which covers arithmetic only). Without this round-trip check
        // a deposit of 2^64 + N advances the u128 cursors by the full amount but
        // bumps the u64 total by N -- desyncing the aggregates AND minting a
        // note whose FIFO interval blankets every future distribution.
        let amount_u64 = amount as u64;
        assert(amount_u64 as u128 == amount, "amount exceeds u64 range");
        totals.total_deposits += amount_u64;
        self.storage.totals.write(totals);
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
        let withdraw_key = poseidon2_hash([note_hash, CLAIM_DOMAIN_WITHDRAW]);
        self.storage.claims.at(withdraw_key).at(caller).claim();
        // H1: also emit a deterministic, claim-recomputable withdraw marker. The
        // SingleUseClaim above is owner-siloed (private, double-withdraw guard) but
        // CANNOT be re-derived by the claim paths; this marker can, so a claim can
        // prove (nullifier non-existence at the distribution snapshot block) that
        // the note had not been withdrawn by then. Without it, withdraw only proved
        // INCLUSION historically -- it never made the note ineligible to claim.
        self.context.push_nullifier_unsafe(withdraw_marker_nullifier(note_hash));

        self.enqueue_self._record_withdraw_private(confirmed.note.amount);
    }

    #[external("public")]
    #[only_self]
    fn _record_withdraw_private(amount: u128) {
        // Round-trip the narrowing cast (wraps, doesn't trap): a note amount
        // above u64 range must revert here, not under-decrement the aggregate.
        let amount_u64 = amount as u64;
        assert(amount_u64 as u128 == amount, "amount exceeds u64 range");
        let mut totals = self.storage.totals.read();
        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        assert(amount_u64 <= available, "insufficient available balance");
        totals.total_deposits -= amount_u64;
        self.storage.totals.write(totals);
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
        let claim_key = poseidon2_hash([note_hash, pid, CLAIM_DOMAIN_DISTRIBUTION]);
        self.storage.claims.at(claim_key).at(caller).claim();

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
        let mut dist = self.storage.distributions.at(pid).read();
        assert(dist.open, "distribution not open");
        assert(supplied_fund_token == self.storage.links.read().fund_token, "fund token mismatch");
        assert(supplied_small_pool == dist.small_pool, "small pool mismatch");
        assert(supplied_small_total == dist.small_total, "small total mismatch");
        assert(supplied_fifo_cap == dist.fifo_cap, "fifo cap mismatch");
        // H1/H3: the private leg proved note existence + non-withdrawal against
        // THIS block; pin it to the real snapshot so an attacker cannot pick an
        // earlier (pre-withdraw / pre-deposit) block.
        assert(supplied_snapshot_block == dist.snapshot_block, "snapshot block mismatch");

        assert(dist.claimed_total + share <= dist.amount, "distribution exhausted");
        dist.claimed_total += share;
        self.storage.distributions.at(pid).write(dist);
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
        let claim_key = poseidon2_hash([note_hash, rid, CLAIM_DOMAIN_RENT]);
        self.storage.claims.at(claim_key).at(caller).claim();

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
        let mut epoch = self.storage.rent_epochs.at(rid).read();
        assert(epoch.open, "rent distribution not open");
        assert(supplied_eur_token == self.storage.links.read().eur_token, "eur token mismatch");
        assert(supplied_small_pool == epoch.small_pool, "small pool mismatch");
        assert(supplied_small_total == epoch.small_total, "small total mismatch");
        assert(supplied_fifo_cap == epoch.fifo_cap, "fifo cap mismatch");
        // H1/H3: pin to the real rent-epoch snapshot block.
        assert(supplied_snapshot_block == epoch.snapshot_block, "snapshot block mismatch");

        assert(epoch.claimed_total + share <= epoch.amount, "rent distribution exhausted");
        epoch.claimed_total += share;
        self.storage.rent_epochs.at(rid).write(epoch);
        let mut rent = self.storage.rent.read();
        rent.total_rent_claimed += share as u64;
        self.storage.rent.write(rent);
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
        let claim_key = poseidon2_hash([note_hash, rid, CLAIM_DOMAIN_RENT]);
        self.storage.claims.at(claim_key).at(caller).claim();

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
            MessageDelivery::onchain_constrained(),
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
        let mut totals = self.storage.totals.read();
        assert(!totals.is_paused, "fund is paused");
        let rid = rent_epoch_id as Field;
        // (a) Rent side: verify epoch + snapshots, enforce ceiling, consume rent.
        let mut epoch = self.storage.rent_epochs.at(rid).read();
        assert(epoch.open, "rent distribution not open");
        assert(supplied_small_pool == epoch.small_pool, "small pool mismatch");
        assert(supplied_small_total == epoch.small_total, "small total mismatch");
        assert(supplied_fifo_cap == epoch.fifo_cap, "fifo cap mismatch");
        // H1/H3: pin to the real rent-epoch snapshot block.
        assert(supplied_snapshot_block == epoch.snapshot_block, "snapshot block mismatch");
        assert(epoch.claimed_total + share <= epoch.amount, "rent distribution exhausted");
        epoch.claimed_total += share;
        self.storage.rent_epochs.at(rid).write(epoch);
        let mut rent = self.storage.rent.read();
        rent.total_rent_claimed += share as u64;
        self.storage.rent.write(rent);

        // (b) Deposit side: supplied-then-verified cursor stamping (mirrors
        // _record_deposit_private), advancing the FIFO axis + total_deposits.
        let mut cursor = self.storage.cursor.read();
        let cum_before = cursor.cum_deposits;
        let seq = cursor.deposit_seq;
        assert(supplied_cum_before == cum_before, "stale cum_before");
        assert(supplied_seq == seq, "stale seq");
        assert(supplied_is_small == (share <= cursor.small_threshold), "is_small mismatch");
        cursor.cum_deposits = cum_before + share;
        if supplied_is_small {
            cursor.cum_small_deposits += share;
        }
        cursor.deposit_seq = seq + 1;
        self.storage.cursor.write(cursor);
        totals.total_deposits += share as u64;
        self.storage.totals.write(totals);
    }

    // -- Emergency controls -----------------------------------------------

    #[external("public")]
    fn pause() {
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");
        let mut totals = self.storage.totals.read();
        totals.is_paused = true;
        self.storage.totals.write(totals);
    }

    #[external("public")]
    fn unpause() {
        assert_eq(self.msg_sender(), self.storage.links.read().admin, "not admin");
        let mut totals = self.storage.totals.read();
        totals.is_paused = false;
        self.storage.totals.write(totals);
    }

    // -- View functions ---------------------------------------------------

    #[external("utility")]
    unconstrained fn get_total_deposits() -> pub u64 {
        self.storage.totals.read().total_deposits
    }

    #[external("utility")]
    unconstrained fn get_user_deposit_ticket(user: AztecAddress) -> pub u64 {
        self.storage.users.at(user).read().deposit_ticket
    }

    #[external("utility")]
    unconstrained fn get_investor_count() -> pub u32 {
        self.storage.totals.read().investor_count
    }

    #[external("utility")]
    unconstrained fn get_investor_at(index: u32) -> pub AztecAddress {
        self.storage.investor_index.at(index as Field).read()
    }

    #[external("utility")]
    unconstrained fn get_fund_stats() -> pub FundStatsView {
        let totals = self.storage.totals.read();
        let available =
            available_balance(totals.total_deposits, totals.total_in_defi, totals.total_allocated);
        FundStatsView {
            total_deposits: totals.total_deposits,
            total_in_defi: totals.total_in_defi,
            total_allocated: totals.total_allocated,
            available,
        }
    }

    // -- Phase 1.1: rent income getters -----------------------------------

    #[external("utility")]
    unconstrained fn get_total_rent_income() -> pub u64 {
        self.storage.rent.read().total_rent_income
    }

    #[external("utility")]
    unconstrained fn get_property_rent(property_id: u32) -> pub u64 {
        self.storage.properties.at(property_id as Field).read().rent_income
    }

    #[external("utility")]
    unconstrained fn get_rent_keeper() -> pub AztecAddress {
        self.storage.links.read().rent_keeper
    }

    #[external("utility")]
    unconstrained fn get_eur_token() -> pub AztecAddress {
        self.storage.links.read().eur_token
    }

    // Rent recorded but not yet opened into a distribution epoch.
    #[external("utility")]
    unconstrained fn get_undistributed_rent() -> pub u64 {
        self.storage.rent.read().undistributed_rent
    }

    #[external("utility")]
    unconstrained fn get_total_rent_claimed() -> pub u64 {
        self.storage.rent.read().total_rent_claimed
    }

    // Rent still held by the fund: collected minus paid out. Surfaced separately
    // from NAV (NAV = total_deposits, pooled capital only); uses this running
    // balance, not the lifetime total, so claimed rent that has left the fund is
    // not double counted.
    #[external("utility")]
    unconstrained fn get_rent_in_fund() -> pub u64 {
        let rent = self.storage.rent.read();
        let income = rent.total_rent_income;
        let claimed = rent.total_rent_claimed;
        if claimed >= income {
            0
        } else {
            income - claimed
        }
    }

    // -- Capped-return (ROR) getters --------------------------------------

    #[external("utility")]
    unconstrained fn get_ror_bps() -> pub u64 {
        self.storage.rent.read().ror_bps
    }

    #[external("utility")]
    unconstrained fn get_acquisition_value(property_id: u32) -> pub u64 {
        self.storage.properties.at(property_id as Field).read().acquisition_value
    }

    // Expected ANNUAL rent for a property = ROR * acquisition_value (cost-based,
    // fully to investors). Integer math via a u128 intermediate (no overflow),
    // floored to whole EUR. Zero if ROR or the acquisition value is unset.
    #[external("utility")]
    unconstrained fn get_expected_annual_rent(property_id: u32) -> pub u64 {
        let acq = self.storage.properties.at(property_id as Field).read().acquisition_value as u128;
        let bps = self.storage.rent.read().ror_bps as u128;
        ((acq * bps) / 10000) as u64
    }

    // Expected MONTHLY rent = expected annual / 12 (floored).
    #[external("utility")]
    unconstrained fn get_expected_monthly_rent(property_id: u32) -> pub u64 {
        let acq = self.storage.properties.at(property_id as Field).read().acquisition_value as u128;
        let bps = self.storage.rent.read().ror_bps as u128;
        (((acq * bps) / 10000) / 12) as u64
    }

    // -- Withdraw-vs-reinvest ledger getters (public path) ----------------

    #[external("utility")]
    unconstrained fn get_rent_withdrawn(user: AztecAddress) -> pub u64 {
        self.storage.users.at(user).read().rent_withdrawn
    }

    #[external("utility")]
    unconstrained fn get_rent_reinvested(user: AztecAddress) -> pub u64 {
        self.storage.users.at(user).read().rent_reinvested
    }

    // Per-rent-epoch snapshot (reuses the DistributionStatus shape).
    #[external("utility")]
    unconstrained fn get_rent_distribution_status(rent_epoch_id: u32) -> pub DistributionStatus {
        snapshot_status(self.storage.rent_epochs.at(rent_epoch_id as Field).read())
    }

    // Public-path claimable-rent preview for a deposit record (by global seq).
    #[external("utility")]
    unconstrained fn get_claimable_rent(rent_epoch_id: u32, user: AztecAddress, seq: u64) -> pub u128 {
        let rid = rent_epoch_id as Field;
        let epoch = self.storage.rent_epochs.at(rid).read();
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, rid, CLAIM_DOMAIN_RENT]);
        let has_claimed = self.storage.record_claims.at(claim_key).read();
        let rec = self.storage.deposit_records.at(poseidon2_hash([user.to_field(), seq as Field])).read();

        if !epoch.open | has_claimed | (rec.owner != user) | (rec.amount == 0) {
            0
        } else {
            total_claim(
                rec.amount,
                rec.cum_before,
                rec.is_small,
                epoch.small_pool,
                epoch.small_total,
                epoch.fifo_cap,
            )
        }
    }

    #[external("utility")]
    unconstrained fn has_claimed_rent(rent_epoch_id: u32, user: AztecAddress, seq: u64) -> pub bool {
        let rid = rent_epoch_id as Field;
        let claim_key = poseidon2_hash([user.to_field(), seq as Field, rid, CLAIM_DOMAIN_RENT]);
        self.storage.record_claims.at(claim_key).read()
    }

    #[external("utility")]
    unconstrained fn get_valuation() -> pub Valuation {
        self.storage.valuation.read()
    }

    #[external("public")]
    #[view]
    fn get_valuation_public() -> pub Valuation {
        self.storage.valuation.read()
    }

    // Public cursor for PXE callers to stamp a private deposit (supplied-then-verified).
    #[external("public")]
    #[view]
    fn get_deposit_cursor() -> pub DepositCursor {
        self.storage.cursor.read()
    }

    #[external("utility")]
    unconstrained fn get_deposit_cursor_unconstrained() -> pub DepositCursor {
        self.storage.cursor.read()
    }

    // Public-path claimable preview for a specific deposit record (by global seq).
    #[external("utility")]
    unconstrained fn get_claimable_amount(proposal_id: u32, user: AztecAddress, seq: u64) -> pub u128 {
        let pid = proposal_id as Field;
        let dist = self.storage.distributions.at(pid).read();
        let claim_key =
            poseidon2_hash([user.to_field(), seq as Field, pid, CLAIM_DOMAIN_DISTRIBUTION]);
        let has_claimed = self.storage.record_claims.at(claim_key).read();
        let rec = self.storage.deposit_records.at(poseidon2_hash([user.to_field(), seq as Field])).read();

        if !dist.open | has_claimed | (rec.owner != user) | (rec.amount == 0) {
            0
        } else {
            total_claim(
                rec.amount,
                rec.cum_before,
                rec.is_small,
                dist.small_pool,
                dist.small_total,
                dist.fifo_cap,
            )
        }
    }

    #[external("utility")]
    unconstrained fn has_claimed(proposal_id: u32, user: AztecAddress, seq: u64) -> pub bool {
        let pid = proposal_id as Field;
        let claim_key =
            poseidon2_hash([user.to_field(), seq as Field, pid, CLAIM_DOMAIN_DISTRIBUTION]);
        self.storage.record_claims.at(claim_key).read()
    }

    // Per-user public deposit-record enumeration (so a caller can list the seqs
    // they may claim against). Private deposits use get_my_deposit_notes instead.
    #[external("utility")]
    unconstrained fn get_my_deposit_record_count(user: AztecAddress) -> pub u32 {
        self.storage.users.at(user).read().deposit_count
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
        snapshot_status(self.storage.distributions.at(proposal_id as Field).read())
    }

    #[external("utility")]
    unconstrained fn is_paused() -> pub bool {
        self.storage.totals.read().is_paused
    }

    #[external("utility")]
    unconstrained fn get_parked_capital_policy() -> pub ParkedCapitalPolicy {
        self.storage.parked.read()
    }

    #[external("utility")]
    unconstrained fn get_admin() -> pub AztecAddress {
        self.storage.links.read().admin
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
