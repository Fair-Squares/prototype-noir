import { NextResponse } from "next/server";
import {
  AZTEC_SLOT_DURATION_SEC,
  ETHEREUM_SLOT_DURATION_SEC,
  EPOCH_DURATION_SLOTS,
  BLOCK_PRODUCTION_MODE,
} from "@/lib/chainParams";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  const votingWindowBlocks = envInt("GOVERNANCE_VOTING_WINDOW_BLOCKS", 300);
  const minQuorumVotes = envInt("GOVERNANCE_MIN_QUORUM_VOTES", 2);
  const priceBandBps = envInt("DEX_PRICE_BAND_BPS", 200);
  const maxTtlBlocks = envInt("DEX_MAX_TTL_BLOCKS", 120);
  const claimMin = envInt("PROTOCOL_REWARDS_CLAIM_MIN", 1);

  // Prefer the live node timing (set per dev profile, e.g. .env.fast uses a 24s
  // slot) over the testnet-like defaults baked into chainParams.
  const aztecSlotDurationSec = envInt("AZTEC_SLOT_DURATION", AZTEC_SLOT_DURATION_SEC);
  const ethereumSlotDurationSec = envInt("ETHEREUM_SLOT_DURATION", ETHEREUM_SLOT_DURATION_SEC);
  const epochDurationSec = EPOCH_DURATION_SLOTS * aztecSlotDurationSec;

  return NextResponse.json({
    timing: {
      aztecSlotDurationSec,
      ethereumSlotDurationSec,
      epochDurationSlots: EPOCH_DURATION_SLOTS,
      epochDurationSec,
      blockProductionMode: BLOCK_PRODUCTION_MODE,
    },
    governance: {
      votingWindowBlocks,
      votingWindowSecondsEstimate: votingWindowBlocks * aztecSlotDurationSec,
      minQuorumVotes,
    },
    dex: {
      priceBandBps,
      maxTtlBlocks,
      maxTtlSecondsEstimate: maxTtlBlocks * aztecSlotDurationSec,
    },
    rewards: {
      claimMin,
    },
  });
}
