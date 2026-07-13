pub mod order_owner_note;
mod test;

use aztec::macros::aztec;

/// FSFTDex V3 -- anonymous lit order book.
///
/// PUBLIC: the order book (per order: seq, side, price, amount, remaining,
/// status, expiry, escrow-token) and every match. PRIVATE: who owns each order
/// (no owner field on chain -- orders are authorized by
/// `owner_tag = poseidon2([secret_owner_key, seq])`, a one-way handle the owner
/// holds in a private OrderOwnerNote), and trader balances.
///
/// Matching is ON-CHAIN inside the placement transaction (no keeper/relayer
/// script): a newly placed order escrows its funds into the DEX's own public
/// balance, then the public `_place_and_match` tail settles it against the
/// crossing resting orders the caller references (validated, not trusted). The
/// DEX settles resting makers from its OWN public balance (self-spend, no
/// authwit needed), so an offline maker needs no live signature.
///
/// Settlement accrues proceeds to per-`owner_tag` PUBLIC claimable counters
/// (no token calls in the match loop -> cheap + bounded). A party later CLAIMS
/// anonymously: they prove their OrderOwnerNote, the DEX pays them out via a
/// `PartialUintNote` commitment so no recipient address ever hits public state.
///
/// Matching policy (this version): EXACT PRICE -- a taker fills makers at exactly
/// its price. Escrow then equals the trade value exactly, so the book is
/// trivially solvent. Price-time "fill-in-order" with price improvement is a
/// documented follow-up (the `policy` arg is reserved).
///
/// Anonymity is ANONYMOUS, not private: sizes/prices are public by design; only
/// identity is hidden. Real-world unlinkability depends on the anonymity set
/// (distinct accounts routing through the same SponsoredFPC fee payer); with one
/// active trader it collapses to one. Self-paid txs deanonymize -- the frontend
/// must pay via the FPC.
#[aztec]
pub contract FSFTDex {
    use crate::order_owner_note::OrderOwnerNote;
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
        },
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash,
            traits::{Deserialize, Serialize, ToField},
        },
        state_vars::{Map, Owned, PrivateSet, PublicImmutable, PublicMutable, StateVariable},
        utils::array,
    };

    global SIDE_BUY: u8 = 0;
    global SIDE_SELL: u8 = 1;

    global STATUS_OPEN: u8 = 0;
    global STATUS_PARTIAL: u8 = 1;
    global STATUS_FILLED: u8 = 2;
    global STATUS_CANCELLED: u8 = 3;
    global STATUS_EXPIRED: u8 = 4;

    global TOKEN_EUR: u8 = 0;
    global TOKEN_FSFT: u8 = 1;

    // Max resting orders one placement may fill on-chain in a single tx
    // (statically-bounded loop). Large orders fill partially and rest.
    global MAX_FILLS: u32 = 4;

    #[derive(Serialize, Deserialize)]
    pub struct OrderView {
        pub seq: u64,
        pub side: u8,
        pub price_bps: u64,
        pub amount: u128,
        pub remaining: u128,
        pub status: u8,
        pub expiry_block: u32,
        pub escrow_token: u8,
    }

    #[derive(Serialize, Deserialize)]
    pub struct OrderbookSnapshot {
        pub ref_price_bps: u64,
        pub min_price_bps: u64,
        pub max_price_bps: u64,
        pub price_band_bps: u32,
        pub max_ttl_blocks: u32,
        pub order_count: u64,
    }

    #[derive(Serialize, Deserialize)]
    pub struct SettlementTokens {
        pub fsft_token: AztecAddress,
        pub eur_token: AztecAddress,
    }

    #[derive(Serialize, Deserialize)]
    pub struct ClaimableView {
        pub fsft: u128,
        pub eur: u128,
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        // Immutable so the private placement leg can read them (verify KYC note
        // origin + escrow into the token) without crossing a per-user value.
        kyc_verifier: PublicImmutable<AztecAddress, Context>,
        fsft_token: PublicImmutable<AztecAddress, Context>,
        eur_token: PublicImmutable<AztecAddress, Context>,
        housing_fund: PublicMutable<AztecAddress, Context>,
        price_band_bps: PublicMutable<u32, Context>,
        max_ttl_blocks: PublicMutable<u32, Context>,

        // Monotonic price-time key + book size. seq IS the order id.
        seq_counter: PublicMutable<u64, Context>,
        order_count: PublicMutable<u64, Context>,

        // The PUBLIC lit book, keyed by seq (as Field). No owner address anywhere.
        o_side: Map<Field, PublicMutable<u8, Context>, Context>,
        o_price_bps: Map<Field, PublicMutable<u64, Context>, Context>,
        o_amount: Map<Field, PublicMutable<u128, Context>, Context>,
        o_remaining: Map<Field, PublicMutable<u128, Context>, Context>,
        o_status: Map<Field, PublicMutable<u8, Context>, Context>,
        o_expiry: Map<Field, PublicMutable<u32, Context>, Context>,
        o_escrow_token: Map<Field, PublicMutable<u8, Context>, Context>,
        o_owner_tag: Map<Field, PublicMutable<Field, Context>, Context>,

        // Per-owner_tag claimable balances (anonymous, not addresses).
        claimable_fsft: Map<Field, PublicMutable<u128, Context>, Context>,
        claimable_eur: Map<Field, PublicMutable<u128, Context>, Context>,

        // Private: each owner's set of ownership receipts (the only person<->order link).
        order_owner_notes: Owned<PrivateSet<OrderOwnerNote, Context>, Context>,
    }

    // EUR value (floor) of `fsft_amount` shares at `price_bps`. Floor everywhere
    // keeps the book solvent (sum of per-fill floors <= floor of the total).
    #[contract_library_method]
    fn eur_value(fsft_amount: u128, price_bps: u64) -> u128 {
        (fsft_amount * price_bps as u128) / 10000
    }

    // Valuation price band as (ref, min, max) in bps: the reference price (the
    // fund's last token price, or par = 10000 if unset) widened by +/- band_bps.
    // Single-sourced so the public snapshot view, the is_price_in_band predicate,
    // and the placement-time guard (_place_and_match) can never diverge.
    #[contract_library_method]
    fn price_band_bounds(token_price_bps: u64, band_bps: u32) -> (u64, u64, u64) {
        let ref_price_bps = if token_price_bps > 0 { token_price_bps } else { 10000 };
        let band = band_bps as u64;
        let min_price_bps = (ref_price_bps * (10000 - band)) / 10000;
        let max_price_bps = (ref_price_bps * (10000 + band)) / 10000;
        (ref_price_bps, min_price_bps, max_price_bps)
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
        // Above 100% the band math (ref * (10000 - band)) underflows and every
        // placement/snapshot would trap -- one admin typo must not halt the book.
        assert(price_band_bps <= 10000, "price band above 100%");
        assert(max_ttl_blocks > 0, "invalid max ttl");

        self.storage.admin.write(admin);
        self.storage.kyc_verifier.initialize(kyc_verifier);
        self.storage.fsft_token.initialize(fsft_token);
        self.storage.eur_token.initialize(eur_token);
        self.storage.housing_fund.write(housing_fund);
        self.storage.price_band_bps.write(price_band_bps);
        self.storage.max_ttl_blocks.write(max_ttl_blocks);
        self.storage.seq_counter.write(0);
        self.storage.order_count.write(0);
    }

    #[external("public")]
    fn set_risk_policy(price_band_bps: u32, max_ttl_blocks: u32) {
        assert_eq(self.msg_sender(), self.storage.admin.read(), "not admin");
        assert(price_band_bps > 0, "invalid price band");
        // Above 100% the band math (ref * (10000 - band)) underflows and every
        // placement/snapshot would trap -- one admin typo must not halt the book.
        assert(price_band_bps <= 10000, "price band above 100%");
        assert(max_ttl_blocks > 0, "invalid max ttl");
        self.storage.price_band_bps.write(price_band_bps);
        self.storage.max_ttl_blocks.write(max_ttl_blocks);
    }

    // -- Place an order + match on-chain (no keeper) --------------------------
    //
    // PRIVATE leg (caller's device, FPC-paid): prove KYC privately (note origin),
    // escrow funds into the DEX's PUBLIC balance, mint the ownership note, then
    // enqueue the public matcher tail. No per-user value crosses to public.

    #[external("private")]
    fn place_order(
        side: u8,
        amount: u128,
        price_bps: u64,
        ttl_blocks: u32,
        secret_owner_key: Field,
        supplied_seq: u64,
        escrow_authwit_nonce: Field,
        match_count: u32,
        maker_seqs: [u64; MAX_FILLS],
        policy: u8,
        hinted_kyc_note: HintedNote<KycCredentialNote>,
    ) {
        assert(amount > 0, "amount must be positive");
        assert(price_bps > 0, "price must be positive");
        assert((side == SIDE_BUY) | (side == SIDE_SELL), "invalid side");
        assert(match_count <= MAX_FILLS, "match_count exceeds bound");

        // KYC proof -- entirely private: the caller holds a KycCredentialNote that
        // originated from our configured KYCVerifier. No per-user value (the
        // revocation commitment) is published, so orders are not linkable via KYC.
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_kyc_note);
        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "kyc note not owned by caller");
        assert(confirmed.note.owner == caller, "kyc note owner mismatch");
        assert(
            confirmed.contract_address == self.storage.kyc_verifier.read(),
            "kyc note from wrong contract",
        );

        // Escrow into the DEX's own public balance. SELL locks FSFT; BUY locks
        // EUR (= amount * price). The caller pre-issued exactly one authwit for
        // this transfer; later settlement of resting makers needs none.
        let this_addr = self.context.this_address();
        let escrow_token = if side == SIDE_SELL { TOKEN_FSFT } else { TOKEN_EUR };
        if side == SIDE_SELL {
            self.call(Token::at(self.storage.fsft_token.read()).transfer_private_to_public(
                caller,
                this_addr,
                amount,
                escrow_authwit_nonce,
            ));
        } else {
            self.call(Token::at(self.storage.eur_token.read()).transfer_private_to_public(
                caller,
                this_addr,
                eur_value(amount, price_bps),
                escrow_authwit_nonce,
            ));
        }

        // Ownership receipt -- the only person<->order link, kept in the caller's PXE.
        // INVARIANT: the OrderOwnerNote is intentionally NOT nullified on
        // claim/cancel/fill. Replay is harmless today because claim zeroes the
        // per-owner_tag claimable balance (a second claim sees 0) and cancel
        // flips the order to CANCELLED (a second cancel reverts "not
        // cancellable"). Any future PARTIAL-claim path must restore this
        // anti-replay guarantee itself (e.g. nullify the note, or track
        // per-(note, action) progress) before relying on the note being single-use.
        let note = OrderOwnerNote::new(caller, secret_owner_key, supplied_seq);
        self.storage.order_owner_notes.at(caller).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        let owner_tag = poseidon2_hash([secret_owner_key, supplied_seq as Field]);
        // Recompute the credential's revocation commitment from the KYC note's
        // packed fields so the public tail can reject revoked/sanctioned traders.
        // Note existence (above) proves issuance, NOT current standing -- revocation
        // lives in KYCVerifier.revocations, which only the public tail can read.
        let credential_commitment = poseidon2_hash([
            confirmed.note.owner.to_field(),
            confirmed.note.nonce,
        ]);
        self.enqueue_self._place_and_match(
            side,
            amount,
            price_bps,
            ttl_blocks,
            supplied_seq,
            owner_tag,
            escrow_token,
            match_count,
            maker_seqs,
            policy,
            credential_commitment,
        );
    }

    #[external("public")]
    #[only_self]
    fn _place_and_match(
        side: u8,
        amount: u128,
        price_bps: u64,
        ttl_blocks: u32,
        supplied_seq: u64,
        owner_tag: Field,
        escrow_token: u8,
        match_count: u32,
        maker_seqs: [u64; MAX_FILLS],
        policy: u8,
        credential_commitment: Field,
    ) {
        // Gate-check the trader's KYC standing. place_order proved the caller
        // OWNS a KycCredentialNote, but issuance != current standing: a revoked
        // or sanctioned investor still holds the note. HousingFund checks this on
        // every deposit; mirror it here so the DEX cannot be a revocation bypass.
        let kyc = KYCVerifier::at(self.storage.kyc_verifier.read());
        let revoked = self.view(kyc.is_credential_revoked(credential_commitment));
        assert(!revoked, "credential revoked");

        // Enforce the valuation price band on the order's price. Until now the band
        // was computed only in get_orderbook_snapshot (#[view]) for the UI -- nothing
        // CONSTRAINED it, so any price_bps > 0 would rest on the book at a stale or
        // manipulated quote. Reuse the exact snapshot math (price_band_bounds) so the
        // view and this guard can never diverge. Makers fill at EXACT price
        // (m_price == price_bps below), so guarding the incoming price keeps every
        // crossing fill in-band too.
        let valuation =
            self.view(HousingFund::at(self.storage.housing_fund.read()).get_valuation_public());
        let (_ref_price_bps, min_price_bps, max_price_bps) =
            price_band_bounds(valuation.last_token_price_bps, self.storage.price_band_bps.read());
        assert((price_bps >= min_price_bps) & (price_bps <= max_price_bps), "price out of band");

        // Enforce the TTL risk policy. Like the price band above, max_ttl_blocks
        // was only surfaced in the snapshot view -- nothing constrained it, so an
        // order could rest for u32-max blocks and the policy was a dead letter.
        assert(ttl_blocks > 0, "ttl must be positive");
        assert(ttl_blocks <= self.storage.max_ttl_blocks.read(), "ttl exceeds policy");

        // Forge-proof FCFS sequence stamp (supplied-then-verified).
        let seq = self.storage.seq_counter.read();
        assert(supplied_seq == seq, "stale seq");
        self.storage.seq_counter.write(seq + 1);

        let now = self.context.block_number();
        let expiry_block = now + ttl_blocks;
        let seq_f = seq as Field;

        // Write the resting row (remaining is decremented as we fill below).
        self.storage.o_side.at(seq_f).write(side);
        self.storage.o_price_bps.at(seq_f).write(price_bps);
        self.storage.o_amount.at(seq_f).write(amount);
        self.storage.o_status.at(seq_f).write(STATUS_OPEN);
        self.storage.o_expiry.at(seq_f).write(expiry_block);
        self.storage.o_escrow_token.at(seq_f).write(escrow_token);
        self.storage.o_owner_tag.at(seq_f).write(owner_tag);
        self.storage.order_count.write(self.storage.order_count.read() + 1);

        // Bounded on-chain match against the caller-referenced resting orders.
        // Every candidate is VALIDATED (crossing exact price + opposite side +
        // active + not expired + strictly older = time priority). Self-cross is
        // not (and cannot be) prevented in the anonymous model -- see the note at
        // the per-maker checks below.
        let mut remaining = amount;
        for i in 0..MAX_FILLS {
            if (i as u32) < match_count {
                let m = maker_seqs[i];
                let mf = m as Field;
                let m_status = self.storage.o_status.at(mf).read();
                let m_side = self.storage.o_side.at(mf).read();
                let m_price = self.storage.o_price_bps.at(mf).read();
                let m_remaining = self.storage.o_remaining.at(mf).read();
                let m_expiry = self.storage.o_expiry.at(mf).read();
                let m_tag = self.storage.o_owner_tag.at(mf).read();

                assert((m_status == STATUS_OPEN) | (m_status == STATUS_PARTIAL), "maker not active");
                assert(m_side != side, "maker same side");
                assert(m < seq, "maker not older");
                assert(now < m_expiry, "maker expired");
                assert(m_price == price_bps, "exact price only");
                // No self-cross guard: in the anonymous model each order draws a
                // fresh `secret_owner_key`, so `owner_tag = poseidon2([secret,
                // seq])` differs between any two orders -- even two from the same
                // trader. A `m_tag != owner_tag` check therefore always passes and
                // cannot actually stop a user matching their own orders. Self-cross
                // is unpreventable here (and economically a no-op: the trader pays
                // both legs), so we don't pretend to block it.

                let fill = if remaining < m_remaining { remaining } else { m_remaining };
                if fill > 0 {
                    let value = eur_value(fill, price_bps);
                    if side == SIDE_BUY {
                        // taker buys: gets FSFT; maker (sell) gets EUR.
                        self.storage.claimable_fsft.at(owner_tag).write(
                            self.storage.claimable_fsft.at(owner_tag).read() + fill,
                        );
                        self.storage.claimable_eur.at(m_tag).write(
                            self.storage.claimable_eur.at(m_tag).read() + value,
                        );
                    } else {
                        // taker sells: gets EUR; maker (buy) gets FSFT.
                        self.storage.claimable_eur.at(owner_tag).write(
                            self.storage.claimable_eur.at(owner_tag).read() + value,
                        );
                        self.storage.claimable_fsft.at(m_tag).write(
                            self.storage.claimable_fsft.at(m_tag).read() + fill,
                        );
                    }

                    let m_after = m_remaining - fill;
                    self.storage.o_remaining.at(mf).write(m_after);
                    if m_after == 0 {
                        self.storage.o_status.at(mf).write(STATUS_FILLED);
                    } else {
                        self.storage.o_status.at(mf).write(STATUS_PARTIAL);
                    }
                    remaining = remaining - fill;
                }
            }
        }

        // Rest the remainder (escrow for it stays locked, refunded on terminal).
        self.storage.o_remaining.at(seq_f).write(remaining);
        if remaining == 0 {
            self.storage.o_status.at(seq_f).write(STATUS_FILLED);
        } else if remaining < amount {
            self.storage.o_status.at(seq_f).write(STATUS_PARTIAL);
        }
        // policy reserved for a future price-time "fill in order" mode.
        let _ = policy;
    }

    // -- Claim proceeds anonymously -------------------------------------------
    //
    // Prove the OrderOwnerNote privately, then the DEX pays the per-owner_tag
    // claimable balance to a PartialUintNote commitment (recipient committed
    // privately, completed by the DEX) -- no recipient address in public state.

    #[external("private")]
    fn claim(hinted_owner_note: HintedNote<OrderOwnerNote>, token: u8) {
        assert((token == TOKEN_EUR) | (token == TOKEN_FSFT), "invalid token");

        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_owner_note);
        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "owner note not owned by caller");
        assert(confirmed.note.owner == caller, "owner note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "owner note from wrong contract",
        );

        let owner_tag = poseidon2_hash([confirmed.note.secret_owner_key, confirmed.note.seq as Field]);
        let token_addr = if token == TOKEN_FSFT {
            self.storage.fsft_token.read()
        } else {
            self.storage.eur_token.read()
        };
        // Privacy entrance: the DEX may complete this partial note to `caller`.
        let commitment = self.call(Token::at(token_addr).initialize_transfer_commitment(
            caller,
            self.context.this_address(),
        ));

        self.enqueue_self._apply_claim(owner_tag, token, token_addr, commitment);
    }

    #[external("public")]
    #[only_self]
    fn _apply_claim(owner_tag: Field, token: u8, token_addr: AztecAddress, commitment: Field) {
        let amount = if token == TOKEN_FSFT {
            self.storage.claimable_fsft.at(owner_tag).read()
        } else {
            self.storage.claimable_eur.at(owner_tag).read()
        };
        assert(amount > 0, "nothing to claim");

        if token == TOKEN_FSFT {
            self.storage.claimable_fsft.at(owner_tag).write(0);
        } else {
            self.storage.claimable_eur.at(owner_tag).write(0);
        }
        // Self-spend from the DEX's escrowed public balance: from == msg_sender
        // (the DEX) so the authwit nonce is 0 and no authorization is needed.
        self.call(Token::at(token_addr).transfer_public_to_commitment(
            self.context.this_address(),
            commitment,
            amount,
            0,
        ));
    }

    // -- Cancel (anonymous) -- reclaim the unfilled escrow ----------------------

    #[external("private")]
    fn cancel_order(hinted_owner_note: HintedNote<OrderOwnerNote>) {
        let header = self.context.get_anchor_block_header();
        let confirmed = assert_note_existed_by(header, hinted_owner_note);
        let caller = self.msg_sender();
        assert(confirmed.owner == caller, "owner note not owned by caller");
        assert(confirmed.note.owner == caller, "owner note owner mismatch");
        assert(
            confirmed.contract_address == self.context.this_address(),
            "owner note from wrong contract",
        );

        let owner_tag = poseidon2_hash([confirmed.note.secret_owner_key, confirmed.note.seq as Field]);
        self.enqueue_self._apply_cancel(confirmed.note.seq, owner_tag);
    }

    #[external("public")]
    #[only_self]
    fn _apply_cancel(seq: u64, owner_tag: Field) {
        let seq_f = seq as Field;
        assert(self.storage.o_owner_tag.at(seq_f).read() == owner_tag, "not order owner");
        let status = self.storage.o_status.at(seq_f).read();
        assert((status == STATUS_OPEN) | (status == STATUS_PARTIAL), "order not cancellable");

        // Refund the unfilled escrow to the owner's anonymous claimable balance.
        let remaining = self.storage.o_remaining.at(seq_f).read();
        if remaining > 0 {
            if self.storage.o_escrow_token.at(seq_f).read() == TOKEN_FSFT {
                self.storage.claimable_fsft.at(owner_tag).write(
                    self.storage.claimable_fsft.at(owner_tag).read() + remaining,
                );
            } else {
                let price = self.storage.o_price_bps.at(seq_f).read();
                self.storage.claimable_eur.at(owner_tag).write(
                    self.storage.claimable_eur.at(owner_tag).read() + eur_value(remaining, price),
                );
            }
            self.storage.o_remaining.at(seq_f).write(0);
        }
        self.storage.o_status.at(seq_f).write(STATUS_CANCELLED);
    }

    // -- Expiry: permissionless status flip + escrow refund to the OWNER's tag --
    // Anyone may call once expired; funds go only to the owner's anonymous
    // claimable (the caller cannot redirect them), so it is a harmless janitor,
    // not a privileged keeper.

    #[external("public")]
    fn mark_expired(seq: u64) {
        let seq_f = seq as Field;
        let status = self.storage.o_status.at(seq_f).read();
        assert((status == STATUS_OPEN) | (status == STATUS_PARTIAL), "order not expirable");
        assert(self.context.block_number() >= self.storage.o_expiry.at(seq_f).read(), "not expired");
        let owner_tag = self.storage.o_owner_tag.at(seq_f).read();

        let remaining = self.storage.o_remaining.at(seq_f).read();
        if remaining > 0 {
            if self.storage.o_escrow_token.at(seq_f).read() == TOKEN_FSFT {
                self.storage.claimable_fsft.at(owner_tag).write(
                    self.storage.claimable_fsft.at(owner_tag).read() + remaining,
                );
            } else {
                let price = self.storage.o_price_bps.at(seq_f).read();
                self.storage.claimable_eur.at(owner_tag).write(
                    self.storage.claimable_eur.at(owner_tag).read() + eur_value(remaining, price),
                );
            }
            self.storage.o_remaining.at(seq_f).write(0);
        }
        self.storage.o_status.at(seq_f).write(STATUS_EXPIRED);
    }

    // -- Views ----------------------------------------------------------------

    #[external("utility")]
    unconstrained fn get_order(seq: u64) -> pub OrderView {
        let f = seq as Field;
        OrderView {
            seq,
            side: self.storage.o_side.at(f).read(),
            price_bps: self.storage.o_price_bps.at(f).read(),
            amount: self.storage.o_amount.at(f).read(),
            remaining: self.storage.o_remaining.at(f).read(),
            status: self.storage.o_status.at(f).read(),
            expiry_block: self.storage.o_expiry.at(f).read(),
            escrow_token: self.storage.o_escrow_token.at(f).read(),
        }
    }

    #[external("utility")]
    unconstrained fn get_order_count() -> pub u64 {
        self.storage.order_count.read()
    }

    // Anonymous claimable balances for an owner_tag (the owner computes the tag
    // off-chain from their note: poseidon2([secret_owner_key, seq])).
    #[external("utility")]
    unconstrained fn get_claimable(owner_tag: Field) -> pub ClaimableView {
        ClaimableView {
            fsft: self.storage.claimable_fsft.at(owner_tag).read(),
            eur: self.storage.claimable_eur.at(owner_tag).read(),
        }
    }

    #[external("public")]
    #[view]
    fn get_orderbook_snapshot() -> pub OrderbookSnapshot {
        let fund = HousingFund::at(self.storage.housing_fund.read());
        let valuation = self.view(fund.get_valuation_public());
        let band_bps = self.storage.price_band_bps.read();
        let (ref_price_bps, min_price_bps, max_price_bps) =
            price_band_bounds(valuation.last_token_price_bps, band_bps);
        OrderbookSnapshot {
            ref_price_bps,
            min_price_bps,
            max_price_bps,
            price_band_bps: band_bps,
            max_ttl_blocks: self.storage.max_ttl_blocks.read(),
            order_count: self.storage.order_count.read(),
        }
    }

    // Whether `price_bps` sits inside the current valuation band. The frontend can
    // pre-check an order before paying for a tx; _place_and_match enforces the same
    // band on-chain via the shared price_band_bounds, so this view and the
    // placement-time guard always agree.
    #[external("public")]
    #[view]
    fn is_price_in_band(price_bps: u64) -> pub bool {
        let fund = HousingFund::at(self.storage.housing_fund.read());
        let valuation = self.view(fund.get_valuation_public());
        let (_ref_price_bps, min_price_bps, max_price_bps) =
            price_band_bounds(valuation.last_token_price_bps, self.storage.price_band_bps.read());
        (price_bps >= min_price_bps) & (price_bps <= max_price_bps)
    }

    #[external("public")]
    #[view]
    // PRIVACY NOTE (M15): public `can_trade` proxies KYCVerifier.is_investor on a
    // public path, so calling it publicly confirms `user`'s KYC status and leaks
    // them into the participant set. Treat as transparency-mode-only; the private
    // order path (place_order with a hinted KYC credential) avoids this exposure.
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

    /// PXE-side: the caller's OrderOwnerNotes (to cancel/claim by seq).
    #[external("utility")]
    unconstrained fn get_my_orders(
        owner: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<HintedNote<OrderOwnerNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = self.storage.order_owner_notes.get_storage_slot();
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
