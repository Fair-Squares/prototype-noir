// Local-network timing constants. These are the protocol's NOMINAL slot/epoch
// durations (the same values the testnet uses), surfaced for reference.
export const AZTEC_SLOT_DURATION_SEC = 36; // nominal L2 slot
export const ETHEREUM_SLOT_DURATION_SEC = 12; // nominal L1 slot
export const EPOCH_DURATION_SLOTS = 2; // local-network forces epochDuration=2

// On the local network the node runs an automine L1 plus a slot-warping watcher:
// it advances time to the next slot ~2 s after a transaction is pending. So
// blocks are sealed quickly AS ACTIVITY HAPPENS (not on a fixed wall-clock
// cadence, and far faster than the nominal 36 s slot). Block-denominated windows
// (e.g. a voting deadline) therefore advance with on-chain activity — a few
// seconds per block in practice — rather than tracking real time.
export const BLOCK_PRODUCTION_MODE: "on-demand" | "steady" = "on-demand";

export function blocksToSeconds(blocks: number): number {
  return Math.max(0, blocks) * AZTEC_SLOT_DURATION_SEC;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
}
