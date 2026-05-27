pub mod order_intent_note;
mod test;

use aztec::macros::aztec;

/// FSFTDex -- investor-only FSFT/EUR orderbook for secondary trading.
///
/// V1 prototype: public per-order map for owner/amount/price + NAV band checks
/// + partial-fill matching.
///
/// V2 additive: per-user OrderIntentNotes in the owner's PXE; on-chain map
/// keys off the commitment so the public orderbook reveals only that some
/// commitment exists (status OPEN/FILLED/CANCELLED) but not who/how much.
/// Match + settlement flow over commitments is staged for a follow-up.
#[aztec]
pub contract FSFTDex {
    use crate::order_intent_note::OrderIntentNote;
    use fund_token::FundToken;
    use housing_fund::HousingFund;
    use kyc_verifier::{KYCVerifier, credential_note::KycCredentialNote};
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
        state_vars::{Map, Owned, PrivateSet, PublicImmutable, PublicMutable, SingleUseClaim, StateVariable},
        utils::array,
    };

    #[derive(Serialize, Deserialize)]
    pub struct OrderInfo {
        pub owner: AztecAddress,
        pub side: u8,
        pub amount: u64,
        pub remaining: u64,
        pub price_bps: u64,
        pub status: u8,
        pub expiry_block: u32,
        pub created_block: u32,
    }

    #[derive(Serialize, Deserialize)]
    pub struct OrderbookSnapshot {
        pub ref_price_bps: u64,
        pub min_price_bps: u64,
        pub max_price_bps: u64,
        pub order_count: u32,
        pub price_band_bps: u32,
        pub max_ttl_blocks: u32,
    }

    #[derive(Serialize, Deserialize)]
    pub struct SettlementTokens {
        pub fsft_token: AztecAddress,
        pub eur_token: AztecAddress,
    }

    global SIDE_BUY: u8 = 0;
    global SIDE_SELL: u8 = 1;

    global STATUS_OPEN: u8 = 0;
    global STATUS_PARTIAL: u8 = 1;
    global STATUS_FILLED: u8 = 2;
    global STATUS_CANCELLED: u8 = 3;
    global STATUS_EXPIRED: u8 = 4;

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        kyc_verifier: PublicMutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        fsft_token: PublicImmutable<AztecAddress, Context>,
        eur_token: PublicImmutable<AztecAddress, Context>,
        // NAV guardrail and order ttl policy
        price_band_bps: PublicMutable<u32, Context>,
        max_ttl_blocks: PublicMutable<u32, Context>,

        order_count: PublicMutable<u32, Context>,

        // Per-order fields (order_id as Field)
        o_owner: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        o_side: Map<Field, PublicMutable<u8, Context>, Context>,
        o_amount: Map<Field, PublicMutable<u64, Context>, Context>,
        o_remaining: Map<Field, PublicMutable<u64, Context>, Context>,
        o_price_bps: Map<Field, PublicMutable<u64, Context>, Context>,
        o_status: Map<Field, PublicMutable<u8, Context>, Context>,
        o_expiry_block: Map<Field, PublicMutable<u32, Context>, Context>,
        o_created_block: Map<Field, PublicMutable<u32, Context>, Context>,

        // V2 additive: per-owner private order intents + commitment-keyed
        // public status map. Owner / amount / price stay in the user's PXE;
        // only the commitment and its status (OPEN / FILLED / CANCELLED) are
        // visible on chain.
        order_intents: Owned<PrivateSet<OrderIntentNote, Context>, Context>,
        order_status_v2: Map<Field, PublicMutable<u8, Context>, Context>,
        // V2 cancel nullifiers: per (intent_note_hash, owner) single-use claim
        // so a given intent can be cancelled at most once.
        cancel_nullifiers: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        admin: AztecAddress,
        kyc_verifier: AztecAddress,
        housing_fund: AztecAddress,
        fsft_token: AztecAddress,
        eur_token: AztecAddress,
        price_band_bps: u32,
        max_ttl_blocks: u32,
    ) {
        assert(!admin.is_zero(), "invalid admin");
        assert(!kyc_verifier.is_zero(), "invalid kyc verifier");
        assert(!housing_fund.is_zero(), "invalid housing fund");
        assert(!fsft_token.is_zero(), "invalid fsft token");
        assert(!eur_token.is_zero(), "invalid eur token");
        assert(price_band_bps > 0, "invalid price band");
        assert(max_ttl_blocks > 0, "invalid max ttl");

        self.storage.admin.write(admin);
        self.storage.kyc_verifier.write(kyc_verifier);
        self.storage.housing_fund.write(housing_fund);
        self.storage.fsft_token.initialize(fsft_token);
        self.storage.eur_token.initialize(eur_token);
        self.storage.price_band_bps.write(price_band_bps);
        self.storage.max_ttl_blocks.write(max_ttl_blocks);
        self.storage.order_count.write(0);
    }

    #[external("public")]
    fn set_risk_policy(price_band_bps: u32, max_ttl_blocks: u32) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(price_band_bps > 0, "invalid price band");
        assert(max_ttl_blocks > 0, "invalid max ttl");
        self.storage.price_band_bps.write(price_band_bps);
        self.storage.max_ttl_blocks.write(max_ttl_blocks);
    }

    #[external("public")]
    fn place_order(side: u8, amount: u64, limit_price_bps: u64, ttl_blocks: u32) -> pub u32 {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "Complete KYC to trade FSFT/EUR.");

        assert((side == SIDE_BUY) | (side == SIDE_SELL), "invalid side");
        assert(amount > 0, "amount must be positive");
        assert(limit_price_bps > 0, "limit price must be positive");
        assert(ttl_blocks > 0, "ttl must be positive");
        assert(ttl_blocks <= self.storage.max_ttl_blocks.read(), "ttl exceeds max");

        let fund = HousingFund::at(self.storage.housing_fund.read());
        let token_price_bps = self.view(fund.get_valuation_public()).last_token_price_bps;
        let ref_price_bps = if token_price_bps > 0 { token_price_bps } else { 10000 };
        let band = self.storage.price_band_bps.read() as u64;
        let min_price_bps = (ref_price_bps * (10000 - band)) / 10000;
        let max_price_bps = (ref_price_bps * (10000 + band)) / 10000;
        assert(ref_price_bps > 0, "invalid nav reference");
        assert(limit_price_bps >= min_price_bps, "price below nav band");
        assert(limit_price_bps <= max_price_bps, "price above nav band");

        let order_id = self.storage.order_count.read();
        let oid = order_id as Field;
        let now_block = self.context.block_number();

        self.storage.o_owner.at(oid).write(caller);
        self.storage.o_side.at(oid).write(side);
        self.storage.o_amount.at(oid).write(amount);
        self.storage.o_remaining.at(oid).write(amount);
        self.storage.o_price_bps.at(oid).write(limit_price_bps);
        self.storage.o_status.at(oid).write(STATUS_OPEN);
        self.storage.o_created_block.at(oid).write(now_block);
        self.storage.o_expiry_block.at(oid).write(now_block + ttl_blocks);

        self.storage.order_count.write(order_id + 1);
        order_id
    }

    /// Taker-match against a specific maker order id.
    /// Private settlement path:
    /// - executes private-note transfers atomically
    /// - then enqueues a public only_self finalizer which re-validates and applies fill
    ///
    /// The matcher passes expected settlement parameters, and `_apply_match_fill`
    /// enforces correctness against current public orderbook state.
    #[external("private")]
    fn match_order(
        taker_order_id: u32,
        maker_order_id: u32,
        fill_amount: u64,
        eur_amount: u64,
        buyer: AztecAddress,
        seller: AztecAddress,
    ) {
        let matcher = self.msg_sender();
        let eur = FundToken::at(self.storage.eur_token.read());
        let fsft = FundToken::at(self.storage.fsft_token.read());

        // Atomic private-note settlement:
        // - Buyer pays EUR privately to seller
        // - Seller delivers FSFT privately to buyer
        self.call(eur.transfer_private_from(buyer, seller, eur_amount));
        self.call(fsft.transfer_private_from(seller, buyer, fill_amount));

        // Update public orderbook state only after private settlement succeeded,
        // and re-validate all matching invariants in public context.
        self.enqueue_self._apply_match_fill(
            taker_order_id,
            maker_order_id,
            fill_amount,
            eur_amount,
            buyer,
            seller,
            matcher,
        );
    }

    #[external("public")]
    fn cancel_order(order_id: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "Complete KYC to trade FSFT/EUR.");

        let oid = order_id as Field;
        let owner = self.storage.o_owner.at(oid).read();
        assert(!owner.is_zero(), "order missing");
        assert(owner.eq(caller), "only order owner can cancel");

        let status_pre = self.storage.o_status.at(oid).read();
        let expired = if (status_pre == STATUS_OPEN) | (status_pre == STATUS_PARTIAL) {
            let expiry = self.storage.o_expiry_block.at(oid).read();
            if self.context.block_number() >= expiry {
                self.storage.o_status.at(oid).write(STATUS_EXPIRED);
                self.storage.o_remaining.at(oid).write(0);
                true
            } else {
                false
            }
        } else {
            false
        };
        assert(!expired, "order expired");

        let status = self.storage.o_status.at(oid).read();
        assert(
            (status == STATUS_OPEN) | (status == STATUS_PARTIAL),
            "order cannot be cancelled",
        );

        self.storage.o_status.at(oid).write(STATUS_CANCELLED);
        self.storage.o_remaining.at(oid).write(0);
    }

    #[external("public")]
    #[only_self]
    fn _apply_match_fill(
        taker_order_id: u32,
        maker_order_id: u32,
        fill_amount: u64,
        eur_amount: u64,
        buyer: AztecAddress,
        seller: AztecAddress,
        matcher: AztecAddress,
    ) {
        assert(taker_order_id != maker_order_id, "invalid pair");
        let taker = taker_order_id as Field;
        let maker = maker_order_id as Field;

        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let matcher_is_investor = self.view(kyc_contract.is_investor(matcher));
        assert(matcher_is_investor, "Complete KYC to trade FSFT/EUR.");

        let taker_owner = self.storage.o_owner.at(taker).read();
        let maker_owner = self.storage.o_owner.at(maker).read();
        assert(!taker_owner.is_zero(), "taker order missing");
        assert(!maker_owner.is_zero(), "maker order missing");
        assert(matcher.eq(taker_owner), "only taker owner can match");
        assert(!taker_owner.eq(maker_owner), "self-match not allowed");

        let taker_status = self.storage.o_status.at(taker).read();
        let maker_status = self.storage.o_status.at(maker).read();
        assert(
            (taker_status == STATUS_OPEN) | (taker_status == STATUS_PARTIAL),
            "taker order not matchable",
        );
        assert(
            (maker_status == STATUS_OPEN) | (maker_status == STATUS_PARTIAL),
            "maker order not matchable",
        );

        let now_block = self.context.block_number();
        let taker_expiry = self.storage.o_expiry_block.at(taker).read();
        let maker_expiry = self.storage.o_expiry_block.at(maker).read();
        assert(now_block < taker_expiry, "taker order expired");
        assert(now_block < maker_expiry, "maker order expired");

        let taker_side = self.storage.o_side.at(taker).read();
        let maker_side = self.storage.o_side.at(maker).read();
        assert(taker_side != maker_side, "sides must oppose");

        let taker_price = self.storage.o_price_bps.at(taker).read();
        let maker_price = self.storage.o_price_bps.at(maker).read();
        if taker_side == SIDE_BUY {
            assert(taker_price >= maker_price, "price does not cross");
        } else {
            assert(maker_price >= taker_price, "price does not cross");
        }

        let taker_remaining = self.storage.o_remaining.at(taker).read();
        let maker_remaining = self.storage.o_remaining.at(maker).read();
        assert(taker_remaining >= fill_amount, "invalid taker fill");
        assert(maker_remaining >= fill_amount, "invalid maker fill");

        let expected_fill = if taker_remaining < maker_remaining {
            taker_remaining
        } else {
            maker_remaining
        };
        assert(fill_amount == expected_fill, "invalid fill amount");

        let (expected_buyer, expected_seller) = if taker_side == SIDE_BUY {
            (taker_owner, maker_owner)
        } else {
            (maker_owner, taker_owner)
        };
        assert(buyer.eq(expected_buyer), "invalid buyer");
        assert(seller.eq(expected_seller), "invalid seller");

        let expected_eur_amount = (fill_amount * maker_price + 9999) / 10000;
        assert(eur_amount == expected_eur_amount, "invalid eur amount");

        let taker_remaining_after = taker_remaining - fill_amount;
        let maker_remaining_after = maker_remaining - fill_amount;

        self.storage.o_remaining.at(taker).write(taker_remaining_after);
        self.storage.o_remaining.at(maker).write(maker_remaining_after);

        if taker_remaining_after == 0 {
            self.storage.o_status.at(taker).write(STATUS_FILLED);
        } else {
            self.storage.o_status.at(taker).write(STATUS_PARTIAL);
        }

        if maker_remaining_after == 0 {
            self.storage.o_status.at(maker).write(STATUS_FILLED);
        } else {
            self.storage.o_status.at(maker).write(STATUS_PARTIAL);
        }
    }

    // -- Views -------------------------------------------------------------

    // -- V2: private order intents --------------------------------------------
    //
    // The caller passes a hinted KycCredentialNote proving they are KYC'd.
    // A private OrderIntentNote is minted into their PXE-side set. The public
    // map order_status_v2 keys off poseidon2(owner, side, amount, price_bps,
    // expiry, salt) so the orderbook can be reasoned about publicly without
    // revealing the per-order owner / amount / price.
    //
    // COMMITMENT SEMANTICS
    // The commitment is an APPLICATION-LEVEL hash of order parameters, not
    // the kernel-computed note_hash (which includes randomness and cannot
    // be reproduced outside the originating private call). The commitment:
    //   - is deterministic from owner + side + amount + price_bps + expiry +
    //     salt so off-chain matchers can reproduce it from observed events
    //   - is stored on chain in order_status_v2 to track OPEN / FILLED /
    //     CANCELLED state
    //   - allows external parties to verify "this intent corresponds to that
    //     commitment" without decrypting the note
    //
    // FUTURE SETTLEMENT FLOW (match_order_private)
    // Once Stage 5.5 lands, settlement will run as:
    //   1. Taker supplies hinted OrderIntentNote from their own PXE.
    //   2. Taker supplies the maker_commitment (publicly observed).
    //   3. Re-derive commitment from the hinted note fields and assert
    //      computed == taker's intent commitment.
    //   4. Constrain price-band match + side-cross.
    //   5. Atomic private settlement (EUR + FSFT transfer_private_from via
    //      authwit) using the taker and maker's own delegated spends.
    //   6. Enqueue only_self _apply_match_fill that flips both commitments
    //      in order_status_v2 to FILLED (or PARTIAL) and bumps a public
    //      matched-volume counter.
    //
    // NULLIFIER SEMANTICS
    // The taker's OrderIntentNote is nullified by the kernel as part of
    // settlement (notes consumed via PrivateSet operations emit nullifiers
    // automatically), preventing double-spend of the same intent. The
    // maker's note is NOT consumed -- only the public status map is updated
    // -- because the maker's PXE has already authorised the settlement via
    // authwit and the maker may want to keep the intent record privately.
    //
    // Match + settlement is staged for a follow-up.

    #[external("private")]
    fn place_order_private(
        side: u8,
        amount: u128,
        price_bps: u64,
        expiry_block: u32,
        salt: Field,
        hinted_kyc_note: HintedNote<KycCredentialNote>,
    ) {
        assert(amount > 0, "amount must be positive");
        assert((side == SIDE_BUY) | (side == SIDE_SELL), "invalid side");

        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_kyc_note);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "kyc note not owned by caller");

        let intent = OrderIntentNote::new(caller, side, amount, price_bps, expiry_block, salt);
        self.storage.order_intents.at(caller).insert(intent).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Compute the public commitment without revealing owner identity.
        let commitment = poseidon2_hash([
            caller.to_field(),
            side as Field,
            amount as Field,
            price_bps as Field,
            expiry_block as Field,
            salt,
        ]);

        // Compute the credential's revocation commitment for the public tail.
        let credential_commitment = poseidon2_hash([
            confirmed.note.owner.to_field(),
            confirmed.note.nonce,
        ]);

        self.enqueue_self._register_intent_commitment(
            commitment,
            confirmed.contract_address,
            credential_commitment,
        );
    }

    #[external("public")]
    #[only_self]
    fn _register_intent_commitment(
        commitment: Field,
        kyc_note_contract: AztecAddress,
        credential_commitment: Field,
    ) {
        let kyc_addr = self.storage.kyc_verifier.read();
        assert(kyc_note_contract == kyc_addr, "kyc note from wrong contract");
        let kyc = KYCVerifier::at(kyc_addr);
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");
        self.storage.order_status_v2.at(commitment).write(STATUS_OPEN);
    }

    // -- V2: private cancel ----------------------------------------------------
    //
    // Owner privately proves they hold a particular OrderIntentNote, consumes
    // a single-use nullifier keyed by the note hash, and the public commitment
    // status flips to CANCELLED. Caller identity is not revealed publicly;
    // only the commitment changes state.
    //
    // Note: full atomic match_order_private + settlement requires authwit
    // delegation to the DEX contract for EUR + FSFT transfers (see the
    // settlement-semantics comment block above place_order_private). That
    // flow is the natural next milestone; cancel arrives first because it
    // doesn't need any token movement, only proof of intent ownership.

    #[external("private")]
    fn cancel_order_private(hinted_intent: HintedNote<OrderIntentNote>) {
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_intent);

        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "intent not owned by caller");
        assert(confirmed.note.owner == caller, "intent owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "intent from wrong contract",
        );

        // Single-use claim by note hash prevents double-cancel.
        let note_hash_for_nullification =
            compute_confirmed_note_hash_for_nullification(confirmed);
        self.storage.cancel_nullifiers.at(note_hash_for_nullification).at(caller).claim();

        // Re-derive the public commitment from the note's fields. This is
        // safe because the note's contents are kernel-verified by
        // assert_note_existed_by; the caller cannot lie about them.
        let commitment = poseidon2_hash([
            confirmed.note.owner.to_field(),
            confirmed.note.side as Field,
            confirmed.note.amount as Field,
            confirmed.note.price_bps as Field,
            confirmed.note.expiry_block as Field,
            confirmed.note.salt,
        ]);

        self.enqueue_self._mark_cancelled_v2(commitment);
    }

    #[external("public")]
    #[only_self]
    fn _mark_cancelled_v2(commitment: Field) {
        let current = self.storage.order_status_v2.at(commitment).read();
        assert(
            (current == STATUS_OPEN) | (current == STATUS_PARTIAL),
            "order is not cancellable",
        );
        self.storage.order_status_v2.at(commitment).write(STATUS_CANCELLED);
    }

    // -- V2: private match + atomic settlement ---------------------------------
    //
    // Atomic FSFT/EUR swap across two private OrderIntentNotes via authwit.
    // Both maker and taker must each have minted a private authwit
    // authorizing this DEX contract to call FundToken.transfer_in_private
    // on their respective tokens for the exact amount/nonce passed here.
    //
    // Leakage profile: the chain sees that taker_commit and maker_commit
    // transitioned to FILLED / PARTIAL. Owner addresses, individual
    // prices, and individual sizes stay private.

    #[external("private")]
    fn match_order_private(
        hinted_taker_intent: HintedNote<OrderIntentNote>,
        hinted_maker_intent: HintedNote<OrderIntentNote>,
        fill_amount: u64,
        taker_authwit_nonce: Field,
        maker_authwit_nonce: Field,
    ) {
        assert(fill_amount > 0, "fill_amount must be positive");

        let header = self.context.get_anchor_block_header();
        let taker = assert_note_existed_by(header, hinted_taker_intent);
        let maker = assert_note_existed_by(header, hinted_maker_intent);

        let this_addr = self.context.this_address();
        assert(
            taker.contract_address == this_addr,
            "taker intent from wrong contract",
        );
        assert(
            maker.contract_address == this_addr,
            "maker intent from wrong contract",
        );

        assert(taker.note.side == SIDE_BUY, "taker must be buy side");
        assert(maker.note.side == SIDE_SELL, "maker must be sell side");

        // Buy crosses sell when buy price >= sell price.
        assert(
            maker.note.price_bps <= taker.note.price_bps,
            "prices do not cross",
        );

        // Fill must not exceed either side's intent amount.
        let fill_u128 = fill_amount as u128;
        assert(fill_u128 <= taker.note.amount, "fill exceeds taker amount");
        assert(fill_u128 <= maker.note.amount, "fill exceeds maker amount");

        // Settle at the maker's price (price-time priority style).
        let eur_notional = (fill_u128 * maker.note.price_bps as u128) / 10000;
        assert(eur_notional > 0, "trade has zero notional");
        let eur_amount = eur_notional as u64;

        let fsft_addr = self.storage.fsft_token.read();
        let eur_addr = self.storage.eur_token.read();

        // Atomic settlement: EUR taker->maker, FSFT maker->taker.
        // FundToken.transfer_in_private has #[authorize_once] -- maker and
        // taker each pre-issued private authwits that the wallet attaches
        // at send time. If either authwit is missing or stale, the kernel
        // rejects the whole tx and neither leg lands.
        self.call(FundToken::at(eur_addr).transfer_in_private(
            taker.note.owner,
            maker.note.owner,
            eur_amount,
            taker_authwit_nonce,
        ));
        self.call(FundToken::at(fsft_addr).transfer_in_private(
            maker.note.owner,
            taker.note.owner,
            fill_amount,
            maker_authwit_nonce,
        ));

        let taker_commit = poseidon2_hash([
            taker.note.owner.to_field(),
            taker.note.side as Field,
            taker.note.amount as Field,
            taker.note.price_bps as Field,
            taker.note.expiry_block as Field,
            taker.note.salt,
        ]);
        let maker_commit = poseidon2_hash([
            maker.note.owner.to_field(),
            maker.note.side as Field,
            maker.note.amount as Field,
            maker.note.price_bps as Field,
            maker.note.expiry_block as Field,
            maker.note.salt,
        ]);

        let taker_fully_filled = fill_u128 == taker.note.amount;
        let maker_fully_filled = fill_u128 == maker.note.amount;

        self.enqueue_self._apply_match_fill_v2(
            taker_commit,
            maker_commit,
            taker_fully_filled,
            maker_fully_filled,
        );
    }

    #[external("public")]
    #[only_self]
    fn _apply_match_fill_v2(
        taker_commit: Field,
        maker_commit: Field,
        taker_filled: bool,
        maker_filled: bool,
    ) {
        let taker_status = self.storage.order_status_v2.at(taker_commit).read();
        assert(
            (taker_status == STATUS_OPEN) | (taker_status == STATUS_PARTIAL),
            "taker order not active",
        );
        let maker_status = self.storage.order_status_v2.at(maker_commit).read();
        assert(
            (maker_status == STATUS_OPEN) | (maker_status == STATUS_PARTIAL),
            "maker order not active",
        );

        let new_taker = if taker_filled { STATUS_FILLED } else { STATUS_PARTIAL };
        let new_maker = if maker_filled { STATUS_FILLED } else { STATUS_PARTIAL };
        self.storage.order_status_v2.at(taker_commit).write(new_taker);
        self.storage.order_status_v2.at(maker_commit).write(new_maker);
    }

    #[external("utility")]
    unconstrained fn get_order_count() -> pub u32 {
        self.storage.order_count.read()
    }

    #[external("utility")]
    unconstrained fn get_order(order_id: u32) -> pub OrderInfo {
        let oid = order_id as Field;
        OrderInfo {
            owner: self.storage.o_owner.at(oid).read(),
            side: self.storage.o_side.at(oid).read(),
            amount: self.storage.o_amount.at(oid).read(),
            remaining: self.storage.o_remaining.at(oid).read(),
            price_bps: self.storage.o_price_bps.at(oid).read(),
            status: self.storage.o_status.at(oid).read(),
            expiry_block: self.storage.o_expiry_block.at(oid).read(),
            created_block: self.storage.o_created_block.at(oid).read(),
        }
    }

    #[external("public")]
    #[view]
    fn get_orderbook_snapshot() -> pub OrderbookSnapshot {
        let fund = HousingFund::at(self.storage.housing_fund.read());
        let valuation = self.view(fund.get_valuation_public());
        let token_price_bps = valuation.last_token_price_bps;
        let ref_price_bps = if token_price_bps > 0 { token_price_bps } else { 10000 };
        let band = self.storage.price_band_bps.read() as u64;
        let min_price_bps = (ref_price_bps * (10000 - band)) / 10000;
        let max_price_bps = (ref_price_bps * (10000 + band)) / 10000;
        OrderbookSnapshot {
            ref_price_bps,
            min_price_bps,
            max_price_bps,
            order_count: self.storage.order_count.read(),
            price_band_bps: self.storage.price_band_bps.read(),
            max_ttl_blocks: self.storage.max_ttl_blocks.read(),
        }
    }

    #[external("public")]
    #[view]
    fn can_trade(user: AztecAddress) -> pub bool {
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        self.view(kyc_contract.is_investor(user))
    }

    #[external("public")]
    #[view]
    fn get_settlement_tokens() -> pub SettlementTokens {
        SettlementTokens {
            fsft_token: self.storage.fsft_token.read(),
            eur_token: self.storage.eur_token.read(),
        }
    }

    /// PXE-side helper: fetch caller's OrderIntentNotes as paged HintedNote
    /// vec. Used by V2 cancel/match flows.
    #[external("utility")]
    unconstrained fn get_my_order_intents(
        owner: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<HintedNote<OrderIntentNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = self.storage.order_intents.get_storage_slot();
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
