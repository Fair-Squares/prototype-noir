/**
 * simulationStore.ts — In-memory state for simulation mode (Vercel / no Aztec node).
 *
 * Prototype v3 capabilities:
 * - Investor-gated deposits, governance, and FSFT/EUR DEX
 * - Quorum-aware governance + permissionless claim flow
 * - Voting eligibility gate (investor + economic exposure)
 * - Protocol token emissions + claiming
 */

// ── Accounts ─────────────────────────────────────────────────────────────────

export const SIM_ACCOUNTS = [
  { index: 0, alias: "test0 (admin)", address: "0x089323ce9a610e9f013b661ce80dde444b554e9f6ed9f5167adb234668f0af72", isAdmin: true },
  { index: 1, alias: "test1",         address: "0x1000000000000000000000000000000000000000000000000000000000000001", isAdmin: false },
  { index: 2, alias: "test2",         address: "0x1000000000000000000000000000000000000000000000000000000000000002", isAdmin: false },
  { index: 3, alias: "test3",         address: "0x1000000000000000000000000000000000000000000000000000000000000003", isAdmin: false },
  { index: 4, alias: "test4",         address: "0x1000000000000000000000000000000000000000000000000000000000000004", isAdmin: false },
];

// ── Constants ────────────────────────────────────────────────────────────────

const DEX_PRICE_BAND_BPS = Number(process.env.DEX_PRICE_BAND_BPS ?? "200") || 200; // +/-2%
const DEX_DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes
const REWARD_TOKEN_SYMBOL = "FSP";
const REWARD_TOKEN_TOTAL_SUPPLY = 10_000_000;
const REWARD_DISTRIBUTION_POOL = 8_000_000;
const REWARD_YEARS = 10;
const EPOCHS_PER_YEAR = 12;
const TOTAL_REWARD_EPOCHS = REWARD_YEARS * EPOCHS_PER_YEAR;
const EPOCH_MS = 30 * 24 * 60 * 60 * 1000; // simplified 30-day monthly epochs
const REWARD_START_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

// 13,12,11,10,10,10,9,9,8,8 (% of the 8M distribution pool).
// SOURCE OF TRUTH: contracts/protocol_rewards/src/main.nr `year_emission_bps`.
// The Noir/TS boundary prevents a shared source -- keep these two in sync.
const YEAR_SPLITS_BPS = [1300, 1200, 1100, 1000, 1000, 1000, 900, 900, 800, 800];

// EXACT mirror of the contract's epoch_emission_target: every epoch in a year
// emits floor(floor(pool * bps / 10000) / 12). No remainder-spreading — the
// contract leaves the flooring dust unminted by design (integer-floor model),
// so the sim must too or the two layers drift within each year.
function buildEmissionSchedule(): number[] {
  const schedule: number[] = [];
  for (let year = 0; year < REWARD_YEARS; year++) {
    const yearly = Math.floor((REWARD_DISTRIBUTION_POOL * YEAR_SPLITS_BPS[year]) / 10_000);
    const perEpoch = Math.floor(yearly / EPOCHS_PER_YEAR);
    for (let month = 0; month < EPOCHS_PER_YEAR; month++) {
      schedule.push(perEpoch);
    }
  }
  return schedule;
}

// Exported for the rewardsEmissionParity Vitest guard only.
export const REWARD_EMISSION_SCHEDULE = buildEmissionSchedule();

// ── Types ────────────────────────────────────────────────────────────────────

interface SimFundState {
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  fsftTotalSupply: number;
  lastAssetSalePrice: number;
  lastFsftMinted: number;
  tokenPriceBps: number;
  isPaused: boolean;
  investorCount: number;
  // Phase 1.1: cumulative on-chain rent income (mirrors HousingFund.record_rent).
  rentIncome: number;
  rentByProperty: Record<number, number>;
  // Phase 1.1 step 3: Return on Rent in basis points (mirrors HousingFund.ror_bps).
  // Rent = ROR × acquisition value; this is the real capped-return parameter.
  rorBps: number;
  parkedAllocationBps: number;
  parkedMinBps: number;
  parkedMaxBps: number;
}

interface SimAccountState {
  eurBalance: number;
  fsftBalance: number;
  protocolTokenBalance: number;
  kycVerified: boolean;
  investorRole: boolean;
  depositedAmount: number;
  lockedEur: number;
  lockedFsft: number;
  fsftVotingAttested: boolean;
  fsftRewardsAttested: boolean;
  // Phase 1.1 step 3: per-holder rent taken as fiat vs reinvested (the
  // withdraw-vs-reinvest ledger). Optional so existing account literals need no
  // change; read with `?? 0`. claimable = earned - withdrawn - reinvested.
  rentWithdrawn?: number;
  rentReinvested?: number;
}

export interface SimProposal {
  id: number;
  title: string;
  description: string;
  descHash: string;
  amount: number;
  yesVotes: number;
  noVotes: number;
  status: number; // 0=active, 1=passed, 2=failed, 3=executed
  deadline: number;
  createdAt: number;
  proposer: string;
  votedBy: string[];
  quorumRequired: number;
  distributionOpened: boolean;
  distributionAmount: number;
  distributionSnapshotDeposits: number;
  distributionClaimed: number;
  claimedBy: string[];
  /** On-chain affordability covenant (W1). Mirrors the value a proposer sets via
   *  Governance.set_proposal_covenant; surfaced as a real (sim) covenant. */
  covenant?: {
    isSet: boolean;
    rentCeilingBps: number;
    lockYears: number;
  };
}

export interface SimVotingEligibility {
  investorRole: boolean;
  hasDepositTicket: boolean;
  hasFsftExposure: boolean;
  hasFsftVotingAttestation: boolean;
  privateFsftProofMode: "none" | "aztec-private-proven" | "recursive-verified";
  recursiveVkConfigured: boolean;
  canVote: boolean;
  reason: string;
}

export interface SimDexOrder {
  id: number;
  side: "buy" | "sell";
  owner: string;
  amount: number;
  remaining: number;
  priceEur: number;
  status: "open" | "partial" | "filled" | "cancelled" | "expired";
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  reservedEurRemaining: number;
  reservedFsftRemaining: number;
}

export interface SimDexTrade {
  id: number;
  buyOrderId: number;
  sellOrderId: number;
  buyer: string;
  seller: string;
  amount: number;
  priceEur: number;
  executedAt: number;
}

interface SimDexState {
  nextOrderId: number;
  nextTradeId: number;
  orders: SimDexOrder[];
  trades: SimDexTrade[];
}

interface SimRewardsState {
  totalClaimed: number;
  lastClaimedEpochByAddress: Record<string, number>;
  voteParticipantsByEpoch: Record<number, Record<string, true>>;
}

interface SimRewardsEligibility {
  investorRole: boolean;
  depositBucketEligible: boolean;
  fsftBucketEligible: boolean;
  governanceBucketHint: string;
  fsftRewardsAttested: boolean;
  fsftProofMode: "none" | "aztec-private-proven" | "recursive-verified";
  recursiveVkConfigured: boolean;
  canClaimNow: boolean;
  nextSteps: string[];
}

interface SimState {
  fund: SimFundState;
  accounts: Record<string, SimAccountState>;
  proposals: SimProposal[];
  nextProposalId: number;
  dex: SimDexState;
  rewards: SimRewardsState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function votingWindowSeconds(): number {
  const mins = Number(process.env.GOVERNANCE_VOTING_WINDOW_MINUTES ?? "5");
  if (!Number.isFinite(mins) || mins <= 0) return 5 * 60;
  return Math.max(60, Math.floor(mins * 60));
}

function quorumVotes(): number {
  const q = Number(process.env.GOVERNANCE_MIN_QUORUM_VOTES ?? "2");
  if (!Number.isFinite(q) || q <= 0) return 2;
  return Math.floor(q);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function dexOrderTtlSeconds(): number {
  const ttl = Number(process.env.DEX_ORDER_TTL_SECONDS ?? "");
  if (!Number.isFinite(ttl) || ttl <= 0) return DEX_DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.floor(ttl));
}

function roundTo4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function ceilCurrency(value: number): number {
  return Math.ceil(value * 100) / 100;
}

function currentRewardEpoch(): number {
  const diff = Date.now() - REWARD_START_MS;
  if (diff < 0) return 0;
  return Math.min(TOTAL_REWARD_EPOCHS, Math.floor(diff / EPOCH_MS));
}

function rewardEpochStartMs(epoch: number): number {
  return REWARD_START_MS + epoch * EPOCH_MS;
}

function getReferenceFsftPriceEur(state: SimState): number {
  // DEX reference = the LAST ISSUANCE price (the token price shares were last
  // issued/distributed at), NOT current NAV-per-share. This mirrors the live
  // contract's last_token_price_bps and the "Last issuance reference price"
  // label (CLAUDE.md "Truth before polish"): resting orders are bounded around
  // the issuance price, not around live NAV. Using NAV/share here produced a
  // reference (~€225) wildly out of line with the order book (~€1).
  const issueRef = state.fund.tokenPriceBps > 0 ? state.fund.tokenPriceBps / 10_000 : 1;
  return roundTo4(issueRef || 1);
}

function allowedPriceBand(price: number): { min: number; max: number } {
  const delta = (price * DEX_PRICE_BAND_BPS) / 10_000;
  return {
    min: roundTo4(Math.max(0.0001, price - delta)),
    max: roundTo4(price + delta),
  };
}

function inPriceBand(price: number, min: number, max: number): boolean {
  return price >= min && price <= max;
}

function getTotalDepositsForRewards(state: SimState): number {
  return Object.values(state.accounts).reduce((acc, a) => acc + Math.max(0, a.depositedAmount), 0);
}

function getFsftRewardsHolderCount(state: SimState): number {
  return Object.values(state.accounts).filter((a) => a.fsftRewardsAttested && a.fsftBalance > 0).length;
}

function getVoteParticipantsForEpoch(state: SimState, epoch: number): string[] {
  return Object.keys(state.rewards.voteParticipantsByEpoch[epoch] ?? {});
}

function markVoteParticipation(state: SimState, address: string): void {
  const epoch = Math.min(TOTAL_REWARD_EPOCHS - 1, currentRewardEpoch());
  if (epoch < 0 || epoch >= TOTAL_REWARD_EPOCHS) return;
  if (!state.rewards.voteParticipantsByEpoch[epoch]) {
    state.rewards.voteParticipantsByEpoch[epoch] = {};
  }
  state.rewards.voteParticipantsByEpoch[epoch][address] = true;
}

function recalcInvestorCount(state: SimState): void {
  state.fund.investorCount = Object.values(state.accounts).filter((a) => a.depositedAmount > 0).length;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

function createInitialState(): SimState {
  const accounts: Record<string, SimAccountState> = {};
  const now = nowSeconds();
  const deadline = now + votingWindowSeconds();

  accounts[SIM_ACCOUNTS[0].address] = {
    eurBalance: 150_000,
    fsftBalance: 0,
    protocolTokenBalance: 0,
    kycVerified: true,
    investorRole: true,
    depositedAmount: 500_000,
    lockedEur: 0,
    lockedFsft: 0,
    fsftVotingAttested: false,
    fsftRewardsAttested: false,
  };
  accounts[SIM_ACCOUNTS[1].address] = {
    eurBalance: 42_000,
    fsftBalance: 1_800,
    protocolTokenBalance: 1_200,
    kycVerified: true,
    investorRole: true,
    depositedAmount: 120_000,
    lockedEur: 0,
    lockedFsft: 0,
    fsftVotingAttested: true,
    fsftRewardsAttested: true,
  };
  accounts[SIM_ACCOUNTS[2].address] = {
    eurBalance: 35_000,
    fsftBalance: 1_300,
    protocolTokenBalance: 300,
    kycVerified: true,
    investorRole: true,
    depositedAmount: 80_000,
    lockedEur: 0,
    lockedFsft: 350,
    fsftVotingAttested: true,
    fsftRewardsAttested: false,
  };
  accounts[SIM_ACCOUNTS[3].address] = {
    eurBalance: 25_000,
    fsftBalance: 0,
    protocolTokenBalance: 0,
    kycVerified: true,
    investorRole: true,
    depositedAmount: 0,
    lockedEur: 505,
    lockedFsft: 0,
    fsftVotingAttested: false,
    fsftRewardsAttested: false,
  };
  accounts[SIM_ACCOUNTS[4].address] = {
    eurBalance: 15_000,
    fsftBalance: 0,
    protocolTokenBalance: 0,
    kycVerified: false,
    investorRole: false,
    depositedAmount: 0,
    lockedEur: 0,
    lockedFsft: 0,
    fsftVotingAttested: false,
    fsftRewardsAttested: false,
  };

  return {
    fund: {
      totalDeposits: 700_000,
      totalInDefi: 210_000,
      totalAllocated: 30_000,
      fsftTotalSupply: 3_100,
      lastAssetSalePrice: 240_000,
      lastFsftMinted: 1_200,
      tokenPriceBps: 10_000,
      isPaused: false,
      investorCount: 3,
      rentIncome: 0,
      rentByProperty: {},
      rorBps: 300, // demo Return on Rent: 3% of acquisition value, paid monthly
      parkedAllocationBps: 3000,
      parkedMinBps: 2000,
      parkedMaxBps: 5000,
    },
    accounts,
    proposals: [
      {
        id: 0,
        // Matches the Maashaven dossier (projectDossier.ts) by both id and title
        // slug, so the featured-project story is coherent in simulation too —
        // not just on the live demo network (whose seed script titles it the same).
        title: "Maashaven Wonen — Rotterdam",
        description: "Close the documented financing gap (onrendabele top) for 20 affordable homes in Rotterdam-Zuid, under a 20-year affordability covenant.",
        descHash: "0x6d616173686176656e5f776f6e656e5f726f7474657264616d00000000000000",
        amount: 210_000,
        yesVotes: 1,
        noVotes: 0,
        status: 0,
        deadline,
        createdAt: now - 60,
        proposer: SIM_ACCOUNTS[0].address,
        votedBy: [SIM_ACCOUNTS[1].address],
        quorumRequired: quorumVotes(),
        distributionOpened: false,
        distributionAmount: 0,
        distributionSnapshotDeposits: 0,
        distributionClaimed: 0,
        claimedBy: [],
        // Maashaven was approved under a 3.5%/yr rent ceiling, 20-year lock,
        // The on-chain covenant the fund enforces in record_rent (rent ceiling +
        // lock). Affordability is enforced by rejecting rent above the ceiling.
        covenant: { isSet: true, rentCeilingBps: 350, lockYears: 20 },
      },
      {
        id: 1,
        title: "Refurbish social housing units in Rotterdam",
        description: "Allocate budget to improve insulation and lower utility costs for tenants.",
        descHash: "0x726f7474657264616d5f72656675726269736800000000000000000000000000",
        amount: 95_000,
        yesVotes: 1,
        noVotes: 1,
        status: 0,
        deadline,
        createdAt: now - 45,
        proposer: SIM_ACCOUNTS[1].address,
        votedBy: [SIM_ACCOUNTS[1].address, SIM_ACCOUNTS[2].address],
        quorumRequired: quorumVotes(),
        distributionOpened: false,
        distributionAmount: 0,
        distributionSnapshotDeposits: 0,
        distributionClaimed: 0,
        claimedBy: [],
      },
      {
        id: 2,
        title: "Reserve capital for two Hague family homes",
        description: "Prepare for a dual purchase pending final legal checks and tenant transfer.",
        descHash: "0x68616775655f66616d696c795f686f6d65730000000000000000000000000000",
        amount: 175_000,
        yesVotes: 0,
        noVotes: 1,
        status: 0,
        deadline,
        createdAt: now - 30,
        proposer: SIM_ACCOUNTS[2].address,
        votedBy: [SIM_ACCOUNTS[3].address],
        quorumRequired: quorumVotes(),
        distributionOpened: false,
        distributionAmount: 0,
        distributionSnapshotDeposits: 0,
        distributionClaimed: 0,
        claimedBy: [],
      },
    ],
    nextProposalId: 3,
    dex: {
      nextOrderId: 3,
      nextTradeId: 2,
      orders: [
        {
          id: 2,
          side: "sell",
          owner: SIM_ACCOUNTS[2].address,
          amount: 350,
          remaining: 350,
          priceEur: 1.02,
          status: "open",
          createdAt: now - 180,
          updatedAt: now - 180,
          expiresAt: now + dexOrderTtlSeconds(),
          reservedEurRemaining: 0,
          reservedFsftRemaining: 350,
        },
        {
          id: 1,
          side: "buy",
          owner: SIM_ACCOUNTS[3].address,
          amount: 500,
          remaining: 500,
          priceEur: 1.01,
          status: "open",
          createdAt: now - 210,
          updatedAt: now - 210,
          expiresAt: now + dexOrderTtlSeconds(),
          reservedEurRemaining: 505,
          reservedFsftRemaining: 0,
        },
      ],
      trades: [
        {
          id: 1,
          buyOrderId: 101,
          sellOrderId: 102,
          buyer: SIM_ACCOUNTS[1].address,
          seller: SIM_ACCOUNTS[2].address,
          amount: 120,
          priceEur: 1.02,
          executedAt: now - 120,
        },
      ],
    },
    rewards: {
      totalClaimed: 15_000,
      lastClaimedEpochByAddress: {
        [SIM_ACCOUNTS[1].address]: 0,
      },
      voteParticipantsByEpoch: {
        0: {
          [SIM_ACCOUNTS[1].address]: true,
          [SIM_ACCOUNTS[2].address]: true,
        },
        1: {
          [SIM_ACCOUNTS[1].address]: true,
        },
      },
    },
  };
}

let _state: SimState | null = null;

function getState(): SimState {
  if (!_state) _state = createInitialState();
  return _state;
}

function getOrCreateAccount(address: string): SimAccountState {
  const s = getState();
  if (!s.accounts[address]) {
    s.accounts[address] = {
      eurBalance: 25_000,
      fsftBalance: 0,
      protocolTokenBalance: 0,
      kycVerified: true,
      investorRole: true,
      depositedAmount: 0,
      lockedEur: 0,
      lockedFsft: 0,
      fsftVotingAttested: false,
      fsftRewardsAttested: false,
    };
  }
  return s.accounts[address];
}

// ── Eligibility / Attestations ──────────────────────────────────────────────

export function simGetVotingEligibility(address: string): SimVotingEligibility {
  const acct = getOrCreateAccount(address);
  const hasDepositTicket = acct.depositedAmount > 0;
  const hasFsftExposure = acct.fsftBalance > 0 || acct.fsftVotingAttested;
  const canVote = acct.investorRole && (hasDepositTicket || hasFsftExposure);
  const privateFsftProofMode = acct.fsftVotingAttested ? "aztec-private-proven" : "none";
  const recursiveVkConfigured = false;

  if (!acct.investorRole) {
    return {
      investorRole: false,
      hasDepositTicket,
      hasFsftExposure,
      hasFsftVotingAttestation: acct.fsftVotingAttested,
      privateFsftProofMode,
      recursiveVkConfigured,
      canVote: false,
      reason: "Investor role required. Complete KYC first.",
    };
  }
  if (canVote) {
    return {
      investorRole: true,
      hasDepositTicket,
      hasFsftExposure,
      hasFsftVotingAttestation: acct.fsftVotingAttested,
      privateFsftProofMode,
      recursiveVkConfigured,
      canVote: true,
      reason: "Eligible to vote.",
    };
  }
  return {
    investorRole: true,
    hasDepositTicket,
    hasFsftExposure,
    hasFsftVotingAttestation: acct.fsftVotingAttested,
    privateFsftProofMode,
    recursiveVkConfigured,
    canVote: false,
    reason: "Voting requires a fund position: a deposit or FSFT exposure.",
  };
}

export function simAttestFsftForVoting(address: string): { success: boolean; error?: string } {
  const acct = getOrCreateAccount(address);
  if (!acct.investorRole) return { success: false, error: "Investor role required" };
  if (acct.fsftBalance <= 0) return { success: false, error: "No FSFT exposure found to attest" };
  acct.fsftVotingAttested = true;
  return { success: true };
}

export function simAttestFsftForRewards(address: string): { success: boolean; error?: string } {
  const acct = getOrCreateAccount(address);
  if (!acct.investorRole) return { success: false, error: "Investor role required" };
  if (acct.fsftBalance <= 0) return { success: false, error: "Hold FSFT before attesting for FSFT reward bucket" };
  acct.fsftRewardsAttested = true;
  return { success: true };
}

// ── Fund stats ────────────────────────────────────────────────────────────────

export function simGetFundStats() {
  const { fund } = getState();
  // NAV = pooled CAPITAL only. Rent is surfaced separately as totalRentIncome.
  const navEur = Math.max(0, fund.totalDeposits);
  const navPerFsftEur = fund.fsftTotalSupply > 0 ? roundTo4(navEur / fund.fsftTotalSupply) : 0;
  const available = Math.max(0, fund.totalDeposits - fund.totalInDefi - fund.totalAllocated);

  return {
    totalDeposits: fund.totalDeposits,
    totalInDefi: fund.totalInDefi,
    totalAllocated: fund.totalAllocated,
    available,
    fsftTotalSupply: fund.fsftTotalSupply,
    totalSupply: fund.fsftTotalSupply,
    lastAssetSalePrice: fund.lastAssetSalePrice,
    lastFsftMinted: fund.lastFsftMinted,
    tokenPriceBps: fund.tokenPriceBps,
    isPaused: fund.isPaused,
    investorCount: fund.investorCount,
    totalRentIncome: fund.rentIncome,
    rorBps: fund.rorBps,
    navEur,
    navPerFsftEur,
    parkedAllocationBps: fund.parkedAllocationBps,
    parkedMinBps: fund.parkedMinBps,
    parkedMaxBps: fund.parkedMaxBps,
    source: "simulation" as const,
  };
}

/**
 * Phase 1.1: record collected rent for a property -- mirrors
 * HousingFund.record_rent. Accrues to the lifetime + per-property rent income
 * that forms the SEPARATE claimable rent-earnings pool (NOT NAV — rent is income
 * on top of capital, per CLAUDE.md). No simulated yield: rent is posted, never
 * fabricated.
 */
export function simRecordRent(
  propertyId: number,
  amount: number,
): { success: boolean; error?: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "rent amount must be positive" };
  }
  const s = getState();
  if (s.fund.isPaused) return { success: false, error: "fund is paused" };
  s.fund.rentIncome += amount;
  s.fund.rentByProperty[propertyId] = (s.fund.rentByProperty[propertyId] ?? 0) + amount;
  return { success: true };
}

/** A holder's currently-claimable (unclaimed) rent = earned - withdrawn - reinvested. */
function simClaimableRent(s: SimState, acct: SimAccountState): number {
  const earned =
    s.fund.fsftTotalSupply > 0
      ? Math.round((s.fund.rentIncome * acct.fsftBalance) / s.fund.fsftTotalSupply)
      : 0;
  return Math.max(0, earned - (acct.rentWithdrawn ?? 0) - (acct.rentReinvested ?? 0));
}

/**
 * Phase 1.1 step 3: WITHDRAW claimable rent as fiat (mirrors HousingFund.claim_rent).
 * Moves the holder's unclaimed pooled rent share to their EUR wallet and records
 * it on the withdraw side of the ledger. No fabrication: bounded by earned rent.
 */
export function simClaimRent(address: string): { success: boolean; error?: string; claimed?: number } {
  const s = getState();
  if (s.fund.isPaused) return { success: false, error: "Fund is paused" };
  const acct = getOrCreateAccount(address);
  const claimable = simClaimableRent(s, acct);
  if (claimable <= 0) return { success: false, error: "No claimable rent" };
  acct.eurBalance += claimable;
  acct.rentWithdrawn = (acct.rentWithdrawn ?? 0) + claimable;
  return { success: true, claimed: claimable };
}

/**
 * Phase 1.1 step 3: REINVEST claimable rent (mirrors HousingFund.reinvest_rent).
 * The rent re-enters the fund via the usual deposit route -- it becomes fresh
 * capital (NAV grows) and is recorded on the reinvest side of the ledger. The
 * EUR stays in the fund; this is the "put it back in the fund" path.
 */
export function simReinvestRent(address: string): { success: boolean; error?: string; reinvested?: number } {
  const s = getState();
  if (s.fund.isPaused) return { success: false, error: "Fund is paused" };
  const acct = getOrCreateAccount(address);
  if (!acct.investorRole) return { success: false, error: "Investor role required" };
  const claimable = simClaimableRent(s, acct);
  if (claimable <= 0) return { success: false, error: "No claimable rent" };
  acct.depositedAmount += claimable;
  s.fund.totalDeposits += claimable;
  acct.rentReinvested = (acct.rentReinvested ?? 0) + claimable;
  // Keep the parked-capital allocation consistent with simDeposit.
  const targetInDefi = Math.floor((s.fund.totalDeposits * s.fund.parkedAllocationBps) / 10_000);
  s.fund.totalInDefi = Math.min(targetInDefi, Math.max(0, s.fund.totalDeposits - s.fund.totalAllocated));
  recalcInvestorCount(s);
  return { success: true, reinvested: claimable };
}

/**
 * Phase 1.1 step 3: set the Return on Rent (mirrors HousingFund.set_ror_bps).
 * Acquisition value is per-property on-chain but not tracked in the sim fund
 * (the dossier worked example uses a modelled acquisition), so only ROR is set.
 */
export function simSetRorConfig(rorBps: number): { success: boolean; error?: string } {
  if (!Number.isFinite(rorBps) || rorBps < 0 || rorBps > 10000) {
    return { success: false, error: "ror bps out of range" };
  }
  getState().fund.rorBps = Math.floor(rorBps);
  return { success: true };
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export function simGetPortfolio(address: string) {
  const acct = getOrCreateAccount(address);
  const { fund } = getState();
  const eligibility = simGetVotingEligibility(address);
  const sharePercent = fund.fsftTotalSupply > 0 ? (acct.fsftBalance / fund.fsftTotalSupply) * 100 : 0;
  // NAV = pooled CAPITAL only; rent does NOT inflate share value (CLAUDE.md).
  const navEur = Math.max(0, fund.totalDeposits);
  const navPerFsftEur = fund.fsftTotalSupply > 0 ? roundTo4(navEur / fund.fsftTotalSupply) : 0;
  // The holder's pooled pro-rata slice of REAL rent income — a SEPARATE claimable
  // earnings stream (withdraw or reinvest), not part of NAV. No fake APY. This is
  // lifetime EARNED; claimable nets out what they already withdrew/reinvested.
  const rentEarned =
    fund.fsftTotalSupply > 0
      ? Math.round((fund.rentIncome * acct.fsftBalance) / fund.fsftTotalSupply)
      : 0;
  const rentWithdrawn = acct.rentWithdrawn ?? 0;
  const rentReinvested = acct.rentReinvested ?? 0;
  const rentClaimable = Math.max(0, rentEarned - rentWithdrawn - rentReinvested);
  const tokenPriceEur = fund.tokenPriceBps / 10_000;
  const rewards = simGetRewardsStatus(address);

  return {
    balance: acct.fsftBalance,
    eurBalance: acct.eurBalance,
    depositedAmount: acct.depositedAmount,
    totalFundDeposits: fund.totalDeposits,
    totalInDefi: fund.totalInDefi,
    totalAllocated: fund.totalAllocated,
    available: Math.max(0, fund.totalDeposits - fund.totalInDefi - fund.totalAllocated),
    totalSupply: fund.fsftTotalSupply,
    sharePercent: Math.round(sharePercent * 100) / 100,
    // estimatedYield = lifetime EARNED rent (unchanged semantics). The actionable
    // unclaimed figure is rentClaimable; the ledger is rentWithdrawn/reinvested.
    estimatedYield: rentEarned,
    rentEarned,
    rentClaimable,
    rentWithdrawn,
    rentReinvested,
    tokenPriceBps: fund.tokenPriceBps,
    tokenPriceEur,
    navPerFsftEur,
    navEur,
    totalRentIncome: fund.rentIncome,
    fsftMarketValue: Math.round(acct.fsftBalance * navPerFsftEur * 100) / 100,
    lastAssetSalePrice: fund.lastAssetSalePrice,
    lastFsftMinted: fund.lastFsftMinted,
    protocolTokenBalance: acct.protocolTokenBalance,
    protocolTokenSymbol: REWARD_TOKEN_SYMBOL,
    rewardsClaimable: rewards.claimable,
    canTradeDex: acct.investorRole,
    rewardsEligible: acct.investorRole && (acct.depositedAmount > 0 || acct.fsftBalance > 0 || acct.fsftRewardsAttested),
    governanceEligibility: eligibility,
    lockedEur: acct.lockedEur,
    lockedFsft: acct.lockedFsft,
    source: "simulation" as const,
  };
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export function simDeposit(address: string, amount: number): { success: boolean; error?: string } {
  const s = getState();
  const acct = getOrCreateAccount(address);

  if (s.fund.isPaused) return { success: false, error: "Fund is paused" };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  if (acct.eurBalance - acct.lockedEur < amount) return { success: false, error: "Insufficient EUR balance" };
  if (!acct.investorRole) return { success: false, error: "Investor role required" };

  acct.eurBalance -= amount;
  acct.depositedAmount += amount;
  s.fund.totalDeposits += amount;

  const targetInDefi = Math.floor((s.fund.totalDeposits * s.fund.parkedAllocationBps) / 10_000);
  s.fund.totalInDefi = Math.min(targetInDefi, Math.max(0, s.fund.totalDeposits - s.fund.totalAllocated));

  recalcInvestorCount(s);
  return { success: true };
}

export function simWithdraw(address: string, amount: number): { success: boolean; error?: string } {
  const s = getState();
  const acct = getOrCreateAccount(address);

  if (s.fund.isPaused) return { success: false, error: "Fund is paused" };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  if (acct.depositedAmount < amount) return { success: false, error: "Insufficient deposited balance" };

  const available = s.fund.totalDeposits - s.fund.totalInDefi - s.fund.totalAllocated;
  if (amount > available) return { success: false, error: "Insufficient available fund balance" };

  acct.depositedAmount -= amount;
  acct.eurBalance += amount;
  s.fund.totalDeposits -= amount;

  const targetInDefi = Math.floor((s.fund.totalDeposits * s.fund.parkedAllocationBps) / 10_000);
  s.fund.totalInDefi = Math.min(targetInDefi, Math.max(0, s.fund.totalDeposits - s.fund.totalAllocated));

  recalcInvestorCount(s);
  return { success: true };
}

// ── KYC ───────────────────────────────────────────────────────────────────────

export function simGetKYCStatus(address: string): boolean {
  return getOrCreateAccount(address).kycVerified;
}

export function simGetKYCProfile(address: string): {
  verified: boolean;
  isInvestor: boolean;
  roles: string[];
} {
  const acct = getOrCreateAccount(address);
  const roles: string[] = [];
  if (acct.investorRole) roles.push("investor");
  return {
    verified: acct.kycVerified,
    isInvestor: acct.investorRole,
    roles,
  };
}

export function simSetKYCVerified(address: string): void {
  const acct = getOrCreateAccount(address);
  acct.kycVerified = true;
  acct.investorRole = true;
  if (acct.eurBalance === 0 && acct.depositedAmount === 0) {
    acct.eurBalance = 25_000;
  }
}

export function simRevokeKYC(address: string): void {
  const acct = getOrCreateAccount(address);
  acct.kycVerified = false;
  acct.investorRole = false;
}

// ── Governance ────────────────────────────────────────────────────────────────

export function simGetProposals(): SimProposal[] {
  return getState().proposals;
}

export function simCreateProposal(
  proposerAddress: string,
  title: string,
  description: string,
  amount: number
): { success: boolean; proposal?: SimProposal; error?: string } {
  const s = getState();
  const proposer = getOrCreateAccount(proposerAddress);
  if (!proposer.investorRole) {
    return { success: false, error: "Investor role required to create proposals" };
  }
  if (amount <= 0) return { success: false, error: "Amount must be positive" };

  const id = s.nextProposalId++;
  const proposal: SimProposal = {
    id,
    title,
    description,
    descHash: "0x" + Buffer.from(title).toString("hex").padStart(64, "0").slice(0, 64),
    amount,
    yesVotes: 0,
    noVotes: 0,
    status: 0,
    deadline: nowSeconds() + votingWindowSeconds(),
    createdAt: nowSeconds(),
    proposer: proposerAddress,
    votedBy: [],
    quorumRequired: quorumVotes(),
    distributionOpened: false,
    distributionAmount: 0,
    distributionSnapshotDeposits: 0,
    distributionClaimed: 0,
    claimedBy: [],
  };

  s.proposals.push(proposal);
  return { success: true, proposal };
}

export function simCastVote(
  address: string,
  proposalId: number,
  voteYes: boolean
): { success: boolean; error?: string } {
  const s = getState();
  const eligibility = simGetVotingEligibility(address);
  if (!eligibility.canVote) return { success: false, error: eligibility.reason };

  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 0) return { success: false, error: "Proposal is not active" };
  if (nowSeconds() >= proposal.deadline) return { success: false, error: "Voting period has ended" };
  if (proposal.votedBy.includes(address)) return { success: false, error: "Already voted" };

  proposal.votedBy.push(address);
  if (voteYes) proposal.yesVotes += 1;
  else proposal.noVotes += 1;

  markVoteParticipation(s, address);
  return { success: true };
}

export function simFinalizeProposal(proposalId: number): { success: boolean; error?: string } {
  const proposal = getState().proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 0) return { success: false, error: "Proposal is not active" };
  if (nowSeconds() < proposal.deadline) return { success: false, error: "Voting window is still open" };

  const totalVotes = proposal.yesVotes + proposal.noVotes;
  if (totalVotes < quorumVotes()) {
    return { success: false, error: `Quorum not reached: ${totalVotes}/${quorumVotes()} votes` };
  }

  proposal.status = proposal.yesVotes > proposal.noVotes ? 1 : 2;
  return { success: true };
}

export function simExecuteProposal(proposalId: number): { success: boolean; error?: string; fsftMinted?: number } {
  const proposal = getState().proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 1) return { success: false, error: "Proposal must be Passed first (finalize it)" };
  proposal.status = 3;
  return { success: true };
}

export function simOpenDistribution(proposalId: number): { success: boolean; error?: string } {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 3) return { success: false, error: "Proposal must be executed first" };
  if (proposal.distributionOpened) return { success: false, error: "Distribution already open" };

  const available = s.fund.totalDeposits - s.fund.totalInDefi - s.fund.totalAllocated;
  if (proposal.amount > available) return { success: false, error: "Insufficient available fund balance" };
  if (s.fund.totalDeposits <= 0) return { success: false, error: "No deposits in fund" };

  proposal.distributionOpened = true;
  proposal.distributionAmount = proposal.amount;
  proposal.distributionSnapshotDeposits = s.fund.totalDeposits;
  proposal.distributionClaimed = 0;
  proposal.claimedBy = [];

  s.fund.totalAllocated += proposal.amount;
  s.fund.lastAssetSalePrice = proposal.amount;
  s.fund.lastFsftMinted = proposal.amount;
  s.fund.tokenPriceBps = 10_000;

  return { success: true };
}

export function simGetClaimableAmount(proposalId: number, address: string): number {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal || !proposal.distributionOpened) return 0;
  if (proposal.claimedBy.includes(address)) return 0;

  const acct = getOrCreateAccount(address);
  if (acct.depositedAmount <= 0) return 0;
  if (proposal.distributionSnapshotDeposits <= 0) return 0;

  const raw = Math.floor((proposal.distributionAmount * acct.depositedAmount) / proposal.distributionSnapshotDeposits);
  const remaining = Math.max(0, proposal.distributionAmount - proposal.distributionClaimed);
  return Math.max(0, Math.min(raw, remaining));
}

export function simClaimDistribution(
  proposalId: number,
  address: string
): { success: boolean; error?: string; claimedAmount?: number } {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (!proposal.distributionOpened) return { success: false, error: "Distribution is not open" };
  if (proposal.claimedBy.includes(address)) return { success: false, error: "Already claimed" };

  const claimable = simGetClaimableAmount(proposalId, address);
  if (claimable <= 0) return { success: false, error: "No claimable amount" };

  const acct = getOrCreateAccount(address);
  acct.fsftBalance += claimable;

  proposal.claimedBy.push(address);
  proposal.distributionClaimed += claimable;

  s.fund.fsftTotalSupply += claimable;
  acct.fsftVotingAttested = acct.fsftVotingAttested || claimable > 0;

  return { success: true, claimedAmount: claimable };
}

// ── DEX ───────────────────────────────────────────────────────────────────────

function getOrderById(state: SimState, orderId: number): SimDexOrder | undefined {
  return state.dex.orders.find((o) => o.id === orderId);
}

function expireOpenOrders(state: SimState): void {
  const now = nowSeconds();
  for (const order of state.dex.orders) {
    if (order.status !== "open" && order.status !== "partial") continue;
    if (order.expiresAt > now) continue;
    order.status = "expired";
    order.remaining = 0;
    order.updatedAt = now;
    releaseOrderLocks(state, order);
  }
}

function releaseOrderLocks(state: SimState, order: SimDexOrder): void {
  const owner = getOrCreateAccount(order.owner);
  if (order.side === "buy" && order.reservedEurRemaining > 0) {
    owner.lockedEur = Math.max(0, roundTo4(owner.lockedEur - order.reservedEurRemaining));
    order.reservedEurRemaining = 0;
  }
  if (order.side === "sell" && order.reservedFsftRemaining > 0) {
    owner.lockedFsft = Math.max(0, roundTo4(owner.lockedFsft - order.reservedFsftRemaining));
    order.reservedFsftRemaining = 0;
  }
}

function settleTrade(state: SimState, buyOrder: SimDexOrder, sellOrder: SimDexOrder, amount: number, tradePrice: number): void {
  const buyer = getOrCreateAccount(buyOrder.owner);
  const seller = getOrCreateAccount(sellOrder.owner);

  const cost = ceilCurrency(amount * tradePrice);

  if (buyer.lockedEur < cost) return;
  if (seller.lockedFsft < amount) return;

  buyer.lockedEur = roundTo4(Math.max(0, buyer.lockedEur - cost));
  buyer.eurBalance = roundTo4(Math.max(0, buyer.eurBalance - cost));
  buyer.fsftBalance = roundTo4(buyer.fsftBalance + amount);

  seller.lockedFsft = roundTo4(Math.max(0, seller.lockedFsft - amount));
  seller.fsftBalance = roundTo4(Math.max(0, seller.fsftBalance - amount));
  seller.eurBalance = roundTo4(seller.eurBalance + cost);

  buyOrder.remaining = roundTo4(Math.max(0, buyOrder.remaining - amount));
  sellOrder.remaining = roundTo4(Math.max(0, sellOrder.remaining - amount));
  buyOrder.reservedEurRemaining = roundTo4(Math.max(0, buyOrder.reservedEurRemaining - cost));
  sellOrder.reservedFsftRemaining = roundTo4(Math.max(0, sellOrder.reservedFsftRemaining - amount));

  buyOrder.status = buyOrder.remaining > 0 ? "partial" : "filled";
  sellOrder.status = sellOrder.remaining > 0 ? "partial" : "filled";
  buyOrder.updatedAt = nowSeconds();
  sellOrder.updatedAt = nowSeconds();

  state.dex.trades.unshift({
    id: state.dex.nextTradeId++,
    buyOrderId: buyOrder.id,
    sellOrderId: sellOrder.id,
    buyer: buyOrder.owner,
    seller: sellOrder.owner,
    amount,
    priceEur: tradePrice,
    executedAt: nowSeconds(),
  });

  if (buyOrder.status === "filled") releaseOrderLocks(state, buyOrder);
  if (sellOrder.status === "filled") releaseOrderLocks(state, sellOrder);
}

function matchOrder(state: SimState, taker: SimDexOrder): void {
  expireOpenOrders(state);
  if (taker.status !== "open" && taker.status !== "partial") return;

  const candidates = state.dex.orders.filter((o) => {
    if (o.id === taker.id) return false;
    if (o.status !== "open" && o.status !== "partial") return false;
    if (o.remaining <= 0) return false;
    if (o.owner === taker.owner) return false;

    if (taker.side === "buy") {
      return o.side === "sell" && o.priceEur <= taker.priceEur;
    }
    return o.side === "buy" && o.priceEur >= taker.priceEur;
  });

  candidates.sort((a, b) => a.createdAt - b.createdAt);

  for (const maker of candidates) {
    if (taker.remaining <= 0) break;

    const amount = roundTo4(Math.min(taker.remaining, maker.remaining));
    if (amount <= 0) continue;
    const tradePrice = roundTo4(maker.priceEur);

    const buyOrder = taker.side === "buy" ? taker : maker;
    const sellOrder = taker.side === "sell" ? taker : maker;
    settleTrade(state, buyOrder, sellOrder, amount, tradePrice);
  }
}

export function simPlaceDexOrder(
  address: string,
  side: "buy" | "sell",
  amount: number,
  limitPriceEur?: number
): { success: boolean; error?: string; order?: SimDexOrder } {
  const state = getState();
  const acct = getOrCreateAccount(address);
  expireOpenOrders(state);

  if (!acct.investorRole) return { success: false, error: "Complete KYC to trade FSFT/EUR." };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };

  const reference = getReferenceFsftPriceEur(state);
  const { min, max } = allowedPriceBand(reference);
  const priceEur = roundTo4(limitPriceEur && limitPriceEur > 0 ? limitPriceEur : reference);

  if (!inPriceBand(priceEur, min, max)) {
    return {
      success: false,
      error: `Price outside the allowed estimated share price band. Allowed range: €${min.toFixed(4)} - €${max.toFixed(4)}`,
    };
  }

  const now = nowSeconds();
  const order: SimDexOrder = {
    id: state.dex.nextOrderId++,
    side,
    owner: address,
    amount: roundTo4(amount),
    remaining: roundTo4(amount),
    priceEur,
    status: "open",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + dexOrderTtlSeconds(),
    reservedEurRemaining: 0,
    reservedFsftRemaining: 0,
  };

  if (side === "buy") {
    const required = ceilCurrency(amount * priceEur);
    if (acct.eurBalance - acct.lockedEur < required) {
      return { success: false, error: "Insufficient EUR wallet balance for buy order" };
    }
    acct.lockedEur = roundTo4(acct.lockedEur + required);
    order.reservedEurRemaining = required;
  } else {
    if (acct.fsftBalance - acct.lockedFsft < amount) {
      return { success: false, error: "Insufficient FSFT balance for sell order" };
    }
    acct.lockedFsft = roundTo4(acct.lockedFsft + amount);
    order.reservedFsftRemaining = roundTo4(amount);
  }

  state.dex.orders.unshift(order);
  matchOrder(state, order);

  if (order.remaining <= 0) {
    order.status = "filled";
    order.remaining = 0;
  } else if (order.remaining < order.amount) {
    order.status = "partial";
  }

  return { success: true, order };
}

export function simCancelDexOrder(address: string, orderId: number): { success: boolean; error?: string } {
  const state = getState();
  expireOpenOrders(state);
  const account = getOrCreateAccount(address);
  if (!account.investorRole) return { success: false, error: "Complete KYC to trade FSFT/EUR." };

  const order = getOrderById(state, orderId);
  if (!order) return { success: false, error: "Order not found" };
  if (order.owner !== address) return { success: false, error: "Only the order owner can cancel" };
  if (order.status === "filled" || order.status === "cancelled" || order.status === "expired") {
    return { success: false, error: "Order cannot be cancelled" };
  }

  order.status = "cancelled";
  order.remaining = 0;
  order.updatedAt = nowSeconds();
  releaseOrderLocks(state, order);

  return { success: true };
}

export function simMatchDexOrder(_address: string, orderId: number): { success: boolean; error?: string } {
  const state = getState();
  expireOpenOrders(state);
  const account = getOrCreateAccount(_address);
  if (!account.investorRole) return { success: false, error: "Complete KYC to trade FSFT/EUR." };

  const order = getOrderById(state, orderId);
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "open" && order.status !== "partial") {
    return { success: false, error: "Order is not matchable" };
  }
  if (order.owner !== _address) {
    return { success: false, error: "Only the taker order owner can match" };
  }

  matchOrder(state, order);
  return { success: true };
}

export function simGetDexOrderbook(address?: string) {
  const state = getState();
  expireOpenOrders(state);
  const referencePrice = getReferenceFsftPriceEur(state);
  const band = allowedPriceBand(referencePrice);

  const openOrders = state.dex.orders.filter((o) => o.status === "open" || o.status === "partial");
  const buyOrders = openOrders.filter((o) => o.side === "buy").sort((a, b) => b.priceEur - a.priceEur || a.createdAt - b.createdAt);
  const sellOrders = openOrders.filter((o) => o.side === "sell").sort((a, b) => a.priceEur - b.priceEur || a.createdAt - b.createdAt);

  return {
    priceReferenceEur: referencePrice,
    priceBandMinEur: band.min,
    priceBandMaxEur: band.max,
    buyOrders,
    sellOrders,
    userOrders: address ? state.dex.orders.filter((o) => o.owner === address) : [],
    recentTrades: state.dex.trades.slice(0, 20),
    source: "simulation" as const,
  };
}

// ── Rewards ───────────────────────────────────────────────────────────────────

function computeRewardsForAddress(address: string): {
  claimable: number;
  nextClaimableEpoch: number;
  uptoEpoch: number;
} {
  const state = getState();
  const acct = getOrCreateAccount(address);
  const lastClaimed = state.rewards.lastClaimedEpochByAddress[address] ?? -1;

  const current = currentRewardEpoch();
  const uptoEpoch = Math.min(TOTAL_REWARD_EPOCHS - 1, current - 1);
  const start = Math.max(0, lastClaimed + 1);

  if (uptoEpoch < start) {
    return { claimable: 0, nextClaimableEpoch: start, uptoEpoch };
  }

  let claimable = 0;
  const totalDeposits = getTotalDepositsForRewards(state);
  const fsftHolders = getFsftRewardsHolderCount(state);

  for (let epoch = start; epoch <= uptoEpoch; epoch++) {
    const emission = REWARD_EMISSION_SCHEDULE[epoch] ?? 0;
    if (emission <= 0) continue;

    const depositPool = Math.floor((emission * 40) / 100);
    const fsftPool = Math.floor((emission * 40) / 100);
    const governancePool = emission - depositPool - fsftPool;

    let epochShare = 0;

    if (depositPool > 0 && totalDeposits > 0 && acct.depositedAmount > 0) {
      epochShare += (depositPool * acct.depositedAmount) / totalDeposits;
    }

    if (fsftPool > 0 && fsftHolders > 0 && acct.fsftRewardsAttested && acct.fsftBalance > 0) {
      epochShare += fsftPool / fsftHolders;
    }

    const voters = getVoteParticipantsForEpoch(state, epoch);
    if (governancePool > 0 && voters.length > 0 && voters.includes(address)) {
      epochShare += governancePool / voters.length;
    }

    claimable += Math.floor(epochShare);
  }

  return { claimable, nextClaimableEpoch: start, uptoEpoch };
}

function buildRewardsEligibility(
  state: SimState,
  address: string,
  account: SimAccountState,
  claimable: number
): SimRewardsEligibility {
  const investorRole = account.investorRole;
  const depositBucketEligible = investorRole && account.depositedAmount > 0;
  const fsftRewardsAttested = account.fsftRewardsAttested;
  const fsftBucketEligible = investorRole && account.fsftBalance > 0 && fsftRewardsAttested;

  const hasGovernanceParticipation = Object.values(state.rewards.voteParticipantsByEpoch).some(
    (bucket) => Boolean(bucket[address])
  );
  const governanceBucketHint = hasGovernanceParticipation
    ? "You have governance activity on record. Keep voting to stay in this reward bucket."
    : "Vote on an active proposal to unlock the governance reward bucket.";

  const nextSteps: string[] = [];
  if (!investorRole) {
    nextSteps.push("Complete KYC to unlock FSP rewards.");
  }
  if (investorRole && !depositBucketEligible) {
    nextSteps.push("Add EURs in Invest to join the deposit reward bucket.");
  }
  if (investorRole && account.fsftBalance <= 0) {
    nextSteps.push("Hold FSFT to join the FSFT reward bucket.");
  } else if (investorRole && account.fsftBalance > 0 && !fsftRewardsAttested) {
    nextSteps.push("Enable FSFT rewards in Portfolio.");
  }
  if (investorRole && !hasGovernanceParticipation) {
    nextSteps.push("Vote in Proposals to start earning governance rewards.");
  }
  if (claimable < 1) {
    nextSteps.push("Claims open once your amount reaches at least 1 FSP.");
  }

  return {
    investorRole,
    depositBucketEligible,
    fsftBucketEligible,
    governanceBucketHint,
    fsftRewardsAttested,
    fsftProofMode: account.fsftVotingAttested ? "aztec-private-proven" : "none",
    recursiveVkConfigured: false,
    canClaimNow: claimable >= 1,
    nextSteps,
  };
}

export function simGetRewardsStatus(address: string) {
  const state = getState();
  const acct = getOrCreateAccount(address);
  const current = currentRewardEpoch();
  const emittedToDate = REWARD_EMISSION_SCHEDULE.slice(0, Math.min(current, TOTAL_REWARD_EPOCHS)).reduce((a, b) => a + b, 0);
  const pending = computeRewardsForAddress(address);
  const eligibility = buildRewardsEligibility(state, address, acct, pending.claimable);

  return {
    token: {
      symbol: REWARD_TOKEN_SYMBOL,
      totalSupply: REWARD_TOKEN_TOTAL_SUPPLY,
      distributionPool: REWARD_DISTRIBUTION_POOL,
      years: REWARD_YEARS,
      totalEpochs: TOTAL_REWARD_EPOCHS,
    },
    weighting: {
      deposit: 40,
      fsft: 40,
      governance: 20,
    },
    currentEpoch: current,
    lastClaimedEpoch: state.rewards.lastClaimedEpochByAddress[address] ?? -1,
    nextClaimableEpoch: pending.nextClaimableEpoch,
    claimableUptoEpoch: pending.uptoEpoch,
    claimable: pending.claimable,
    claimMin: 1,
    emittedToDate,
    totalClaimed: state.rewards.totalClaimed,
    balance: acct.protocolTokenBalance,
    fsftRewardsAttested: acct.fsftRewardsAttested,
    eligibility,
    source: "simulation" as const,
    nextEpochAt: rewardEpochStartMs(Math.min(current + 1, TOTAL_REWARD_EPOCHS)),
  };
}

export function simGetRewardsOverview() {
  const state = getState();
  const current = currentRewardEpoch();
  const emittedToDate = REWARD_EMISSION_SCHEDULE.slice(0, Math.min(current, TOTAL_REWARD_EPOCHS)).reduce((a, b) => a + b, 0);
  const yearlySchedule = YEAR_SPLITS_BPS.map((bps, index) => ({
    year: index + 1,
    percent: bps / 100,
    tokens: Math.floor((REWARD_DISTRIBUTION_POOL * bps) / 10_000),
  }));

  return {
    token: {
      symbol: REWARD_TOKEN_SYMBOL,
      totalSupply: REWARD_TOKEN_TOTAL_SUPPLY,
      distributionPool: REWARD_DISTRIBUTION_POOL,
      years: REWARD_YEARS,
      totalEpochs: TOTAL_REWARD_EPOCHS,
    },
    weighting: {
      deposit: 40,
      fsft: 40,
      governance: 20,
    },
    curveYearlyPercents: YEAR_SPLITS_BPS.map((bps) => bps / 100),
    yearlySchedule,
    currentEpoch: current,
    claimMin: 1,
    emittedToDate,
    totalClaimed: state.rewards.totalClaimed,
    remainingPool: Math.max(0, REWARD_DISTRIBUTION_POOL - emittedToDate),
    epochsRemaining: Math.max(0, TOTAL_REWARD_EPOCHS - current),
    nextEpochAt: rewardEpochStartMs(Math.min(current + 1, TOTAL_REWARD_EPOCHS)),
    source: "simulation" as const,
  };
}

export function simClaimRewards(address: string): { success: boolean; error?: string; claimed?: number } {
  const state = getState();
  const acct = getOrCreateAccount(address);
  if (!acct.investorRole) return { success: false, error: "Investor role required" };

  const { claimable, uptoEpoch } = computeRewardsForAddress(address);
  if (claimable < 1) {
    return { success: false, error: "Claimable amount is below minimum (1 token)" };
  }

  acct.protocolTokenBalance += claimable;
  state.rewards.totalClaimed += claimable;
  state.rewards.lastClaimedEpochByAddress[address] = uptoEpoch;

  return { success: true, claimed: claimable };
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export function simGetAccounts() {
  return SIM_ACCOUNTS;
}
