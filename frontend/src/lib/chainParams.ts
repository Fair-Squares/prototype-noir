// Local-network timing constants. These mirror the aztec service settings in
// docker-compose.yml — keep them in sync if you change the compose file.
export const AZTEC_SLOT_DURATION_SEC = 36; // AZTEC_SLOT_DURATION
export const ETHEREUM_SLOT_DURATION_SEC = 12; // ETHEREUM_SLOT_DURATION (Anvil --block-time)
export const EPOCH_DURATION_SLOTS = 2; // local-network forces epochDuration=2

// Whether the local sequencer seals a block every slot ("steady") or only when
// there are pending transactions ("on-demand"). We run on-demand: forcing
// steady per-slot blocks destabilised checkpoint publishing on this local
// network (frequent prunes that dropped user txs), so block-based deadlines
// advance with activity rather than wall-clock time.
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
