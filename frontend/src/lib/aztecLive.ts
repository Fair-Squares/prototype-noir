/**
 * aztecLive.ts — Live-mode feature flag.
 *
 * `isLiveModeEnabled()` is the single source of truth for whether server API
 * routes should attempt real on-chain reads/writes (live mode) or fall back to
 * the deterministic local simulation. When it returns `false`, simulation is
 * always used.
 *
 * The previous `getLive*` storage readers were removed: they fabricated
 * sentinel values (zeroed proposals/portfolios, a synthetic 7-day deadline,
 * `source: "live"`) for state that cannot be read server-side without WASM, and
 * had no importers.
 */

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isLiveModeEnabled(): boolean {
  // IMPORTANT: Use only non-NEXT_PUBLIC_ variables here.
  // NEXT_PUBLIC_* values are baked into the server bundle at build time by
  // webpack, so runtime .env.local changes don't affect them in API routes.
  // AZTEC_LIVE is a true runtime server-only env var.
  return process.env.AZTEC_LIVE === "true";
}
