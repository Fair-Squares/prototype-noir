/**
 * aztecLive.ts — Real on-chain contract reads.
 *
 * Uses only plain JSON-RPC (callNodeRpc / node_getPublicStorageAt).
 * No barretenberg WASM, no @aztec/aztec.js imports, no worker threads.
 *
 * Storage slots are read directly. Mapping slots (private balances, KYC
 * per-address) require poseidon2 hash derivation which needs WASM — those
 * are marked TODO and return safe defaults until a browser wallet is wired up.
 *
 * All amounts are stored as raw field elements (u128 packed as Field).
 */

import { callNodeRpc } from "./aztecClient";

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isLiveModeEnabled(): boolean {
  // IMPORTANT: Use only non-NEXT_PUBLIC_ variables here.
  // NEXT_PUBLIC_* values are baked into the server bundle at build time by
  // webpack, so runtime .env.local changes don't affect them in API routes.
  // AZTEC_LIVE is a true runtime server-only env var.
  return process.env.AZTEC_LIVE === "true";
}

/**
 * Simulation mode is the default whenever live mode is off.
 *
 * This keeps local demo flows reliable without requiring a specific deployment
 * target or extra env toggles.
 */
export function isVercelSimulationMode(): boolean {
  return !isLiveModeEnabled();
}

// ── Contract addresses from env ───────────────────────────────────────────────

function addr(key: string): string {
  return process.env[key] ?? "";
}

const HOUSING_FUND   = () => addr("NEXT_PUBLIC_HOUSING_FUND_ADDRESS");
const FUND_TOKEN     = () => addr("NEXT_PUBLIC_FUND_TOKEN_ADDRESS");
const KYC_VERIFIER   = () => addr("NEXT_PUBLIC_KYC_VERIFIER_ADDRESS");
const GOVERNANCE     = () => addr("NEXT_PUBLIC_GOVERNANCE_ADDRESS");

// ── Low-level storage helpers ─────────────────────────────────────────────────

/** Get the hash of the current best block (required by getPublicStorageAt). */
async function getLatestBlockHash(): Promise<string> {
  const tips = await callNodeRpc<{ proposed: { hash: string } }>(
    "node_getL2Tips"
  );
  return tips.proposed.hash;
}

/** Pad a slot number to a 0x-prefixed 64-char hex string. */
function slotHex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

/**
 * Read a single public storage slot.
 * Returns the value as a bigint (0n if slot is unset / zero).
 */
async function readSlot(
  contractAddress: string,
  slot: bigint,
  blockHash?: string
): Promise<bigint> {
  const bh = blockHash ?? (await getLatestBlockHash());
  const raw = await callNodeRpc<string | null>(
    "node_getPublicStorageAt",
    [bh, contractAddress, slotHex(slot)]
  );
  if (!raw || raw === "0x" + "0".repeat(64)) return 0n;
  return BigInt(raw);
}

/**
 * Read multiple slots in one block snapshot (single getL2Tips call).
 */
async function readSlots(
  contractAddress: string,
  slots: bigint[],
  blockHash?: string
): Promise<bigint[]> {
  const bh = blockHash ?? (await getLatestBlockHash());
  return Promise.all(slots.map((s) => readSlot(contractAddress, s, bh)));
}

// ── Field helpers ─────────────────────────────────────────────────────────────

/** Aztec Field elements are at most 254 bits. Convert to EUR float (18 decimals). */
function fieldToEur(raw: bigint): number {
  // Fund amounts are stored as plain integers (no decimals in this prototype)
  return Number(raw);
}

// ── Fund stats ────────────────────────────────────────────────────────────────

export interface LiveFundStats {
  totalDeposits: number;  // HousingFund.total_deposits  (slot 7)
  totalInDefi:   number;  // HousingFund.total_in_defi   (slot 8)
  totalAllocated:number;  // HousingFund.total_allocated (slot 9)
  isPaused:      boolean; // HousingFund.is_paused       (slot 37, post Phase-3 FIFO fields)
  totalSupply:   number;  // FSFT Token.total_supply      (slot 8, AIP-20)
  investorCount: number;  // KYCVerifier.verified_count  (slot 4)
  available:     number;  // totalDeposits - totalInDefi - totalAllocated
  source: "live";
}

export async function getLiveFundStats(): Promise<LiveFundStats> {
  const bh = await getLatestBlockHash();

  // Parallel reads across 3 contracts
  const [hf, ft, kyc] = await Promise.all([
    // HousingFund post Phase-3 layout: total_deposits(7), total_in_defi(8),
    // total_allocated(9), is_paused(37) -- FIFO/allocation fields shifted is_paused.
    readSlots(HOUSING_FUND(), [7n, 8n, 9n, 37n], bh), // HousingFund
    // FSFT is the vendored AIP-20 Token. Its storage layout is
    // name(1)/symbol(3)/decimals(5)/private_balances(7)/total_supply(8)/
    // public_balances(9)/minter(10) -- see src/artifacts/Token.ts. total_supply
    // is at slot 8 (NOT slot 2; that was the bespoke FundToken layout).
    readSlots(FUND_TOKEN(), [8n], bh), // FSFT Token total_supply
    readSlots(KYC_VERIFIER(), [4n], bh), // KYCVerifier
  ]);

  const totalDeposits  = fieldToEur(hf[0]);
  const totalInDefi    = fieldToEur(hf[1]);
  const totalAllocated = fieldToEur(hf[2]);
  const isPaused       = hf[3] !== 0n;
  const totalSupply    = fieldToEur(ft[0]);
  const investorCount  = Number(kyc[0]);
  const available      = Math.max(0, totalDeposits - totalInDefi - totalAllocated);

  return {
    totalDeposits,
    totalInDefi,
    totalAllocated,
    isPaused,
    totalSupply,
    investorCount,
    available,
    source: "live",
  };
}

// ── Governance proposals ──────────────────────────────────────────────────────

export interface LiveProposal {
  id: number;
  descHash: string;   // 0x-hex of p_desc_hash mapping value
  amount: number;     // p_amount
  yesVotes: number;   // p_yes_votes
  noVotes: number;    // p_no_votes
  status: number;     // p_status (0=Active, 1=Passed, 2=Rejected, 3=Executed)
  proposer: string;   // p_proposer address
  deadline: number;   // not on-chain in this version — default 0
  title: string;      // not on-chain — derived from descHash
  description: string;
}

/**
 * Derive storage slot for map entry.
 * Aztec Map storage: slot(key) = poseidon2([map_base_slot, key_as_field])
 *
 * Requires barretenberg WASM — not available server-side.
 * Returns null to signal "unavailable".
 *
 * TODO: implement via browser wallet or a lightweight pure-JS poseidon2.
 */
async function deriveMappingSlot(
  _mapBaseSlot: bigint,
  _keyHex: string
): Promise<bigint | null> {
  return null; // WASM required — skip for now
}

export async function getLiveProposals(): Promise<LiveProposal[]> {
  const proposalCount = Number(await readSlot(GOVERNANCE(), 3n));
  if (proposalCount === 0) return [];

  const proposals: LiveProposal[] = [];

  for (let id = 0; id < proposalCount; id++) {
    // Map slots: poseidon2([id, base_slot]) — requires WASM, skip individual reads
    // for now. Return a placeholder with id and default values.
    const idKey = "0x" + id.toString(16).padStart(64, "0");
    const mapSlot = await deriveMappingSlot(4n, idKey);

    if (mapSlot === null) {
      // Can't compute mapping slot without WASM
      proposals.push({
        id,
        descHash: "0x0000",
        amount: 0,
        yesVotes: 0,
        noVotes: 0,
        status: 0,
        proposer: "0x0",
        deadline: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        title: `Proposal #${id}`,
        description: "Connect a wallet to view full proposal details.",
      });
      continue;
    }

    const bh = await getLatestBlockHash();
    const [descHash, amount, yesVotes, noVotes, status, proposer] =
      await Promise.all([
        readSlot(GOVERNANCE(), mapSlot,     bh),
        readSlot(GOVERNANCE(), mapSlot + 1n, bh),
        readSlot(GOVERNANCE(), mapSlot + 2n, bh),
        readSlot(GOVERNANCE(), mapSlot + 3n, bh),
        readSlot(GOVERNANCE(), mapSlot + 4n, bh),
        readSlot(GOVERNANCE(), mapSlot + 5n, bh),
      ]);

    proposals.push({
      id,
      descHash: "0x" + descHash.toString(16).padStart(64, "0"),
      amount: fieldToEur(amount),
      yesVotes: Number(yesVotes),
      noVotes: Number(noVotes),
      status: Number(status),
      proposer: "0x" + proposer.toString(16).padStart(64, "0"),
      deadline: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      title: `Proposal #${id}`,
      description: "On-chain proposal — connect wallet to decode IPFS metadata.",
    });
  }

  return proposals;
}

// ── KYC status ────────────────────────────────────────────────────────────────

export async function getLiveKYCStatus(userAddress: string): Promise<boolean> {
  // KYCVerifier.verified is a Map<AztecAddress, bool> at base slot 3.
  // Reading it requires poseidon2([userAddress, 3]) — needs WASM.
  // TODO: implement when browser wallet provides the hash function.
  void userAddress;
  return false; // safe default — don't accidentally allow unverified users
}

// ── Portfolio (private state) ─────────────────────────────────────────────────

export interface LivePortfolio {
  balance:       number;  // FSFT balance (private — needs PXE)
  eurBalance:    number;  // EURs balance (private — needs PXE)
  sharePercent:  number;  // derived: balance / totalSupply * 100
  estimatedYield:number;  // derived: balance * 0.03
  source: "live";
}

export async function getLivePortfolio(userAddress: string): Promise<LivePortfolio> {
  // Private balances require the user's viewing key (PXE decryption).
  // Server-side we can only read totalSupply to compute share % for a known balance.
  // TODO: route private reads through the browser wallet.
  void userAddress;

  // FSFT total_supply is at slot 8 in the vendored AIP-20 Token layout
  // (name/symbol/decimals/private_balances precede it). See getLiveFundStats.
  const totalSupply = fieldToEur(await readSlot(FUND_TOKEN(), 8n));

  return {
    balance: 0,
    eurBalance: 0,
    sharePercent: totalSupply > 0 ? 0 : 0,
    estimatedYield: 0,
    source: "live",
  };
}
