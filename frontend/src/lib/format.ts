/**
 * Canonical number/date formatting (UX overhaul Phase 0; owner decision D7:
 * English formatting with the euro symbol — `€1,281.50`).
 *
 * This is the single home for user-facing formatting. formatEUR /
 * formatEURDecimals / formatFSFT keep their long-standing names (they predate
 * this module in contracts.ts, which now re-exports them) so existing call
 * sites keep working; new helpers cover percentages (bps never reaches the
 * UI — lexicon Tier 3), counts, and time.
 */

const EUR_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * Format a euro amount. The protocol's money math is whole-EUR by design, so
 * the default renders no decimals ("€1,282"). Pass `decimals` for price-like
 * values that need precision (e.g. share price at 4 dp → "€1.2810").
 */
export function formatEUR(value: number | bigint, decimals = 0): string {
  if (decimals === 0) return EUR_WHOLE.format(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Cent-precision euros ("€1,281.50") — the historical two-decimal helper. */
export function formatEURDecimals(value: number | bigint): string {
  return formatEUR(value, 2);
}

/**
 * Format an FSFT (Fund Shares) amount. FSFT is a token COUNT representing
 * ownership — never a currency, so this renders e.g. "20,000 FSFT", not
 * "€20,000". Use for distribution pools/claims (minted FSFT), NOT for EUR
 * figures like the proposal funding request or rent income.
 */
export function formatFSFT(value: number | bigint): string {
  return `${INT.format(value)} FSFT`;
}

/** Format a plain count (investors, homes, votes): integer with separators. */
export function formatCount(value: number | bigint): string {
  return INT.format(value);
}

/** Format a percentage given in percent units: 3 → "3.0%", 3.25 → "3.3%". */
export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Format a percentage given in basis points: 300 → "3.0%". The UI never shows
 * "bps" outside `/reference`-style advanced surfaces — convert at the edge.
 */
export function formatPctFromBps(bps: number, decimals = 1): string {
  return formatPct(bps / 100, decimals);
}

/** Absolute date-time, compact: "12 Jul 2026, 14:05". */
export function formatDateTime(date: Date): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day}, ${time}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/**
 * Human relative time from now: "in 2 days", "3 hours ago". Pair with
 * formatDateTime for the hover/secondary absolute value.
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < hour) return RELATIVE.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return RELATIVE.format(Math.round(diffMs / hour), "hour");
  return RELATIVE.format(Math.round(diffMs / day), "day");
}
