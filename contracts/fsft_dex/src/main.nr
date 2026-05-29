pub mod order_intent_note;
mod test;

use aztec::macros::aztec;

/// FSFTDex -- investor-only FSFT/EUR private-intents orderbook for secondary
/// trading.
///
/// Phase 3: the legacy V1 public orderbook (per-order owner/amount/price maps +
/// `transfer_private_from` settlement) is RETIRED. It relied on the bespoke
/// FundToken delegated-spender allowance, which the vendored AIP-20 `Token` does
/// not have. The DEX now standardizes entirely on the V2 commitment + authwit
/// flow and settles via `Token.transfer_private_to_private` (u128).
///
/// V2: per-user OrderIntentNotes live in the owner's PXE; the on-chain map keys
/// off an application-level commitment so the public orderbook reveals only that
/// some commitment exists and its status (OPEN / PARTIAL / FILLED / CANCELLED) --
/// never who / how much / at what price. Match + settlement is atomic across
/// both legs via maker/taker authwits.
#[aztec]
pub contract FSFTDex {
    use crate::order_intent_note::OrderIntentNote;
    use token_contract::Token;
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

    // Informational NAV-band snapshot (the band is advisory under the private
    // V2 flow; price is not revealed on chain so it cannot be enforced per order).
    #[derive(Serialize, Deserialize)]
    pub struct OrderbookSnapshot {
        pub ref_price_bps: u64,
        pub min_price_bps: u64,
        pub max_price_bps: u64,
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

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        kyc_verifier: PublicMutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        fsft_token: PublicImmutable<AztecAddress, Context>,
        eur_token: PublicImmutable<AztecAddress, Context>,
        // NAV guardrail and order ttl policy (advisory; surfaced in the snapshot)
        price_band_bps: PublicMutable<u32, Context>,
        max_ttl_blocks: PublicMutable<u32, Context>,

        // Per-owner private order intents + commitment-keyed public status map.
        // Owner / amount / price stay in the user's PXE; only the commitment and
        // its status (OPEN / PARTIAL / FILLED / CANCELLED) are visible on chain.
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
    }

    #[external("public")]
    fn set_risk_policy(price_band_bps: u32, max_ttl_blocks: u32) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(price_band_bps > 0, "invalid price band");
        assert(max_ttl_blocks > 0, "invalid max ttl");
        self.storage.price_band_bps.write(price_band_bps);
        self.storage.max_ttl_blocks.write(max_ttl_blocks);
    }

    // -- V2: private order intents --------------------------------------------
    //
    // The caller passes a hinted KycCredentialNote proving they are KYC'd.
    // A private OrderIntentNote is minted into their PXE-side set. The public
    // map order_status_v2 keys off poseidon2(owner, side, amount, price_bps,
    // expiry, salt) so the orderbook can be reasoned about publicly without
    // revealing the per-order owner / amount / price.
    //
    // The commitment is an APPLICATION-LEVEL hash of order parameters (not the
    // kernel note_hash): deterministic from the order fields so off-chain
    // matchers can reproduce it from observed events, stored on chain to track
    // OPEN / FILLED / CANCELLED, and verifiable against the note without
    // decrypting it.

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
    // status flips to CANCELLED. Caller identity is not revealed publicly.

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

        // Re-derive the public commitment from the note's kernel-verified fields.
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
    // Both maker and taker must each have minted a private authwit authorizing
    // this DEX contract to call the vendored Token's transfer_private_to_private
    // (#[authorize_once("from","_nonce")]) on their respective tokens for the
    // exact amount/nonce passed here. If either authwit is missing or stale, the
    // kernel rejects the whole tx and neither leg lands.
    //
    // Leakage profile: the chain sees that taker_commit and maker_commit
    // transitioned to FILLED / PARTIAL. Owner addresses, individual prices, and
    // individual sizes stay private.

    #[external("private")]
    fn match_order_private(
        hinted_taker_intent: HintedNote<OrderIntentNote>,
        hinted_maker_intent: HintedNote<OrderIntentNote>,
        fill_amount: u128,
        taker_authwit_nonce: Field,
        maker_authwit_nonce: Field,
    ) {
        assert(fill_amount > 0, "fill_amount must be positive");

        let header = self.context.get_anchor_block_header();
        let taker = assert_note_existed_by(header, hinted_taker_intent);
        let maker = assert_note_existed_by(header, hinted_maker_intent);

        let this_addr = self.context.this_address();
        assert(taker.contract_address == this_addr, "taker intent from wrong contract");
        assert(maker.contract_address == this_addr, "maker intent from wrong contract");

        assert(taker.note.side == SIDE_BUY, "taker must be buy side");
        assert(maker.note.side == SIDE_SELL, "maker must be sell side");

        // Buy crosses sell when buy price >= sell price.
        assert(maker.note.price_bps <= taker.note.price_bps, "prices do not cross");

        // Fill must not exceed either side's intent amount.
        assert(fill_amount <= taker.note.amount, "fill exceeds taker amount");
        assert(fill_amount <= maker.note.amount, "fill exceeds maker amount");

        // Settle at the maker's price (price-time priority style). u128 throughout.
        let eur_notional = (fill_amount * maker.note.price_bps as u128) / 10000;
        assert(eur_notional > 0, "trade has zero notional");

        let fsft_addr = self.storage.fsft_token.read();
        let eur_addr = self.storage.eur_token.read();

        // Atomic settlement: EUR taker->maker, FSFT maker->taker, via the
        // vendored AIP-20 Token's authwit-gated private transfer.
        self.call(Token::at(eur_addr).transfer_private_to_private(
            taker.note.owner,
            maker.note.owner,
            eur_notional,
            taker_authwit_nonce,
        ));
        self.call(Token::at(fsft_addr).transfer_private_to_private(
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

        let taker_fully_filled = fill_amount == taker.note.amount;
        let maker_fully_filled = fill_amount == maker.note.amount;

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

    // -- Views -------------------------------------------------------------

    #[external("utility")]
    unconstrained fn get_order_status(commitment: Field) -> pub u8 {
        self.storage.order_status_v2.at(commitment).read()
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
