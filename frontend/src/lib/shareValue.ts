/**
 * Fund Share (FSFT) valuation — at PURCHASE PRICE until property valuations exist.
 *
 * FSFT are only minted when the fund buys a home, at the issuance price the
 * contract records (`last_token_price_bps`). Deposits that have not yet been
 * used for a home stay deposit principal and carry no shares. Dividing the
 * fund's TOTAL deposits by the shares outstanding (the old "NAV per share")
 * therefore valued every share against capital it does not represent — €1,000
 * of deposits could read as €61,665 of shares. Until a valuation oracle marks
 * the homes, a share is worth what was paid for it.
 *
 * Shared by the simulation store and the live API routes so both paths agree.
 */

/** EUR price of one share from the contract's issuance price in basis points;
 *  null before any home has been bought (no share has a price yet). */
export function sharePriceFromBps(tokenPriceBps: number): number | null {
  if (!Number.isFinite(tokenPriceBps) || tokenPriceBps < 0) {
    throw new Error(`Invalid share issuance price: ${tokenPriceBps} bps`);
  }
  return tokenPriceBps > 0 ? tokenPriceBps / 10_000 : null;
}

/** A holding's value at purchase price, to the cent; null when shares are held
 *  but no issuance price is known (never a silent €0). */
export function shareValueAtPurchase(balance: number, sharePriceEur: number | null): number | null {
  if (balance <= 0) return 0;
  if (sharePriceEur == null) return null;
  return Math.round(balance * sharePriceEur * 100) / 100;
}
