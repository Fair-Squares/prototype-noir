/**
 * Canonical user-facing vocabulary (UX overhaul Phase 0).
 *
 * Single source of truth for the labels the app repeats, per the tiered
 * lexicon:
 *
 * - Tier 1 (neobank register + human-outcome words): free use.
 * - Tier 2 (deliberate finance jargon: NAV, covenant, secondary market…):
 *   headings/labels allowed, first appearance per screen gets an InfoDot
 *   one-liner — the canonical one-liners live here too.
 * - Tier 3 (protocol-internal): banned from primary UI, enforced by
 *   `__tests__/lexicon.test.ts` against BANNED_PRIMARY_UI_TERMS below.
 *   Sanctioned Tier-3 surfaces (see the test's EXCLUDED list): /reference
 *   and the projects Proofs panel.
 */

/** Canonical labels — import these instead of retyping strings per page. */
export const LEXICON = {
  /** Ownership. First mention per screen: `sharesFirstMention`; after: `shares`. */
  shares: "Shares",
  sharesFirstMention: "shares (FSFT)",
  sharePrice: "Share price (at purchase)",

  /** Income streams — never merged with share value (canonical economic model). */
  rentalIncome: "Rental income",
  rewards: "Rewards (FSP)",

  /** Lifecycle & actions. */
  payout: "Payout",
  moneyToCollect: "Money to collect",
  confirmEligibility: "Confirm eligibility (private)",
  recordResult: "Record result",
  deployCapital: "Deploy capital & open payout",

  /** Destinations (nav labels, Phase 1). */
  votes: "Votes",
  secondaryMarket: "Secondary market",

  /** Return phrasing (owner decision D6 — the ROR formula stated honestly). */
  cappedReturn: "3% target annual return — capped by design",
} as const;

/**
 * Canonical Tier-2 one-liners for InfoDots (§1 table). Keyed for reuse so the
 * same definition renders wherever the term first appears on a screen.
 */
export const TERM_DEFINITIONS = {
  nav: "Net asset value — the fund's pooled capital. A share is valued at the price paid for the homes until they are revalued.",
  cappedReturn:
    "Returns are capped at ~3% by design, so rents stay below market. This is the deal.",
  covenant:
    "A binding rent ceiling voted with each project and enforced on-chain.",
  secondaryMarket:
    "Sell shares to other verified investors without waiting for the fund.",
  orderBook: "Open buy and sell orders from other investors.",
  privateBalance: "Held under your keys; amounts visible only to you.",
  liquidity: "How quickly you can turn shares back into euros.",
} as const;

export interface BannedTerm {
  /** Stable name used in the ratchet baseline. */
  name: string;
  /** Applied to user-visible string literals / JSX text only. */
  pattern: RegExp;
  /** What to write instead. */
  hint: string;
}

/**
 * Tier-3 terms banned from primary UI.
 * The lexicon guard test extracts user-visible strings from app/components
 * sources and fails on any new occurrence.
 */
export const BANNED_PRIMARY_UI_TERMS: BannedTerm[] = [
  { name: "epoch", pattern: /\bepochs?\b/i, hint: 'say "reward month N of 120"' },
  { name: "bps", pattern: /\bbps\b/i, hint: "convert to a percentage (formatPctFromBps)" },
  { name: "attest", pattern: /\battest\w*/i, hint: 'say "confirm eligibility (private)"' },
  { name: "nullifier", pattern: /\bnullifiers?\b/i, hint: "protocol internal — drop or move to /reference" },
  { name: "shield", pattern: /\bshield\w*/i, hint: 'say "move to your private balance"' },
  { name: "escrow", pattern: /\bescrow\w*/i, hint: 'say "reserved — collect it below"' },
  { name: "aip-standard", pattern: /\bAIP-\d+/, hint: "token-standard IDs belong in /reference" },
  {
    name: "contract-function",
    pattern: /\b(record_rent|deposit_private|cast_vote_private|claim_rent|reinvest_rent|place_order|set_user_epoch_weights)\b/,
    hint: "contract entrypoint names never appear outside /reference",
  },
  {
    name: "block-height",
    pattern: /\bblock (height|number)s?\b/i,
    hint: "human time first — render deadlines via proposalLifecycle window labels",
  },
];
