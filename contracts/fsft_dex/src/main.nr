use aztec::macros::aztec;

/// FSFTDex -- investor-only FSFT/EUR orderbook for secondary trading.
///
/// v3 prototype:
/// - investor-only order placement/matching/cancel
/// - NAV band checks (default +/-2%)
/// - taker-match with partial fills
/// - expiry support
///
/// Settlement remains contract-mediated and deterministic; private delegated
/// settlement hooks are handled at integration level.
#[aztec]
pub contract FSFTDex {
    use housing_fund::HousingFund;
    use kyc_verifier::KYCVerifier;
    use aztec::{
        macros::{
            functions::{external, initializer, view},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

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
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        admin: AztecAddress,
        kyc_verifier: AztecAddress,
        housing_fund: AztecAddress,
        price_band_bps: u32,
        max_ttl_blocks: u32,
    ) {
        assert(!admin.is_zero(), "invalid admin");
        assert(!kyc_verifier.is_zero(), "invalid kyc verifier");
        assert(!housing_fund.is_zero(), "invalid housing fund");
        assert(price_band_bps > 0, "invalid price band");
        assert(max_ttl_blocks > 0, "invalid max ttl");

        self.storage.admin.write(admin);
        self.storage.kyc_verifier.write(kyc_verifier);
        self.storage.housing_fund.write(housing_fund);
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
        let (_, _, token_price_bps, _) = self.view(fund.get_valuation_public());
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
    /// Caller must be an investor. Partial fills are supported.
    #[external("public")]
    fn match_order(taker_order_id: u32, maker_order_id: u32) {
        let caller = self.msg_sender();
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        let is_investor = self.view(kyc_contract.is_investor(caller));
        assert(is_investor, "Complete KYC to trade FSFT/EUR.");

        assert(taker_order_id != maker_order_id, "invalid pair");

        let taker = taker_order_id as Field;
        let maker = maker_order_id as Field;

        let taker_owner = self.storage.o_owner.at(taker).read();
        let maker_owner = self.storage.o_owner.at(maker).read();
        assert(!taker_owner.is_zero(), "taker order missing");
        assert(!maker_owner.is_zero(), "maker order missing");
        assert(!taker_owner.eq(maker_owner), "self-match not allowed");

        let taker_status_pre = self.storage.o_status.at(taker).read();
        let maker_status_pre = self.storage.o_status.at(maker).read();

        let taker_expired = if (taker_status_pre == STATUS_OPEN) | (taker_status_pre == STATUS_PARTIAL) {
            let expiry = self.storage.o_expiry_block.at(taker).read();
            if self.context.block_number() >= expiry {
                self.storage.o_status.at(taker).write(STATUS_EXPIRED);
                self.storage.o_remaining.at(taker).write(0);
                true
            } else {
                false
            }
        } else {
            false
        };

        let maker_expired = if (maker_status_pre == STATUS_OPEN) | (maker_status_pre == STATUS_PARTIAL) {
            let expiry = self.storage.o_expiry_block.at(maker).read();
            if self.context.block_number() >= expiry {
                self.storage.o_status.at(maker).write(STATUS_EXPIRED);
                self.storage.o_remaining.at(maker).write(0);
                true
            } else {
                false
            }
        } else {
            false
        };
        assert(!taker_expired, "taker order expired");
        assert(!maker_expired, "maker order expired");

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
        assert(taker_remaining > 0, "taker has no remaining");
        assert(maker_remaining > 0, "maker has no remaining");

        let fill_amount = if taker_remaining < maker_remaining {
            taker_remaining
        } else {
            maker_remaining
        };

        self.storage.o_remaining.at(taker).write(taker_remaining - fill_amount);
        self.storage.o_remaining.at(maker).write(maker_remaining - fill_amount);

        let taker_remaining_after = self.storage.o_remaining.at(taker).read();
        if taker_remaining_after == 0 {
            self.storage.o_status.at(taker).write(STATUS_FILLED);
        } else {
            self.storage.o_status.at(taker).write(STATUS_PARTIAL);
        }

        let maker_remaining_after = self.storage.o_remaining.at(maker).read();
        if maker_remaining_after == 0 {
            self.storage.o_status.at(maker).write(STATUS_FILLED);
        } else {
            self.storage.o_status.at(maker).write(STATUS_PARTIAL);
        }
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

    // -- Views -------------------------------------------------------------

    #[external("utility")]
    unconstrained fn get_order_count() -> pub u32 {
        self.storage.order_count.read()
    }

    #[external("utility")]
    unconstrained fn get_order(order_id: u32) -> pub (AztecAddress, u8, u64, u64, u64, u8, u32, u32) {
        let oid = order_id as Field;
        (
            self.storage.o_owner.at(oid).read(),
            self.storage.o_side.at(oid).read(),
            self.storage.o_amount.at(oid).read(),
            self.storage.o_remaining.at(oid).read(),
            self.storage.o_price_bps.at(oid).read(),
            self.storage.o_status.at(oid).read(),
            self.storage.o_expiry_block.at(oid).read(),
            self.storage.o_created_block.at(oid).read(),
        )
    }

    #[external("public")]
    #[view]
    fn get_orderbook_snapshot() -> pub (u64, u64, u64, u32, u32, u32) {
        let fund = HousingFund::at(self.storage.housing_fund.read());
        let (_, _, token_price_bps, _) = self.view(fund.get_valuation_public());
        let ref_price_bps = if token_price_bps > 0 { token_price_bps } else { 10000 };
        let band = self.storage.price_band_bps.read() as u64;
        let min_price_bps = (ref_price_bps * (10000 - band)) / 10000;
        let max_price_bps = (ref_price_bps * (10000 + band)) / 10000;
        (
            ref_price_bps,
            min_price_bps,
            max_price_bps,
            self.storage.order_count.read(),
            self.storage.price_band_bps.read(),
            self.storage.max_ttl_blocks.read(),
        )
    }

    #[external("public")]
    #[view]
    fn can_trade(user: AztecAddress) -> pub bool {
        let kyc_contract = KYCVerifier::at(self.storage.kyc_verifier.read());
        self.view(kyc_contract.is_investor(user))
    }
}
