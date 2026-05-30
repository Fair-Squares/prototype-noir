/**
 * Contract client — thin wrapper around API routes.
 *
 * In simulation mode (default): API routes use in-memory state.
 * In live mode (AZTEC_LIVE=true): API routes call real Aztec PXE.
 *
 * The frontend always talks to these functions, never directly to PXE.
 */

async function readApiError(res: Response, fallbackMessage: string): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
        ? body.message
        : fallbackMessage;
    return new Error(message);
  } catch {
    return new Error(fallbackMessage);
  }
}

// ── Fund Stats ────────────────────────────────────────────────────────────────

export interface FundStats {
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  available: number;
  isPaused: boolean;
  investorCount: number;
  totalSupply: number;
  lastAssetSalePrice?: number;
  lastFsftMinted?: number;
  tokenPriceBps?: number;
  navEur?: number;
  navPerFsftEur?: number;
  parkedAllocationBps?: number;
  parkedMinBps?: number;
  parkedMaxBps?: number;
  source?: string;
}

export async function fetchFundStats(): Promise<FundStats> {
  const res = await fetch("/api/fund/stats");
  if (!res.ok) throw await readApiError(res, "Failed to fetch fund stats");
  return res.json();
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export interface DepositResult {
  success: boolean;
  message?: string;
  error?: string;
  txHash?: string;
  blockNumber?: number | null;
  status?: string | null;
  eurTransferTxHash?: string | null;
  eurTransferBlockNumber?: number | null;
}

export async function depositFunds(
  address: string,
  amount: number,
  accountIndex = 0
): Promise<DepositResult> {
  const res = await fetch("/api/fund/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount, accountIndex }),
  });
  return res.json();
}

export async function withdrawFunds(
  address: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/fund/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount, accountIndex }),
  });
  return res.json();
}

// ── KYC Status ────────────────────────────────────────────────────────────────

export interface KYCProfile {
  verified: boolean;
  isInvestor: boolean;
  roles: string[];
  canTradeDex?: boolean;
  canVote?: boolean;
  voteEligibilityReason?: string;
  hasDepositTicket?: boolean;
  hasFsftExposure?: boolean;
  rewardsEligible?: boolean;
  source?: string;
}

export async function fetchKYCProfile(address: string): Promise<KYCProfile> {
  const res = await fetch(`/api/kyc/status?address=${encodeURIComponent(address)}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch KYC profile");
  const data = (await res.json()) as {
    verified?: unknown;
    isInvestor?: unknown;
    roles?: unknown;
    canTradeDex?: unknown;
    canVote?: unknown;
    voteEligibilityReason?: unknown;
    hasDepositTicket?: unknown;
    hasFsftExposure?: unknown;
    rewardsEligible?: unknown;
    source?: unknown;
  };

  if (typeof data.verified !== "boolean") {
    throw new Error("KYC profile response missing boolean `verified`");
  }
  if (typeof data.isInvestor !== "boolean") {
    throw new Error("KYC profile response missing boolean `isInvestor`");
  }
  if (!Array.isArray(data.roles) || !data.roles.every((role) => typeof role === "string")) {
    throw new Error("KYC profile response missing `roles` string array");
  }

  return {
    verified: data.verified,
    isInvestor: data.isInvestor,
    roles: data.roles,
    canTradeDex: typeof data.canTradeDex === "boolean" ? data.canTradeDex : undefined,
    canVote: typeof data.canVote === "boolean" ? data.canVote : undefined,
    voteEligibilityReason:
      typeof data.voteEligibilityReason === "string" ? data.voteEligibilityReason : undefined,
    hasDepositTicket: typeof data.hasDepositTicket === "boolean" ? data.hasDepositTicket : undefined,
    hasFsftExposure: typeof data.hasFsftExposure === "boolean" ? data.hasFsftExposure : undefined,
    rewardsEligible: typeof data.rewardsEligible === "boolean" ? data.rewardsEligible : undefined,
    source: typeof data.source === "string" ? data.source : undefined,
  };
}

export async function fetchKYCStatus(address: string): Promise<boolean> {
  const profile = await fetchKYCProfile(address);
  return profile.verified;
}

export async function registerKYC(
  userAddress: string,
  devMode = false
): Promise<{ success: boolean; error?: string; message?: string; verified?: boolean; isInvestor?: boolean; roles?: string[] }> {
  const res = await fetch("/api/kyc/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress, devMode }),
  });
  return res.json();
}

// ── Governance ────────────────────────────────────────────────────────────────

export interface Proposal {
  id: number;
  title: string;
  description: string;
  descHash: string;
  amount: number;
  yesVotes: number;
  noVotes: number;
  status: number; // 0=active, 1=passed, 2=failed, 3=executed
  deadline: number; // block number (legacy alias)
  createdAt: number; // block number (legacy alias)
  deadlineBlock?: number;
  createdBlock?: number;
  currentBlock?: number;
  quorumRequired?: number;
  totalVotes?: number;
  quorumReached?: boolean;
  distributionOpened?: boolean;
  distributionAmount?: number;
  distributionSnapshotDeposits?: number;
  distributionClaimed?: number;
  claimableAmount?: number;
  hasClaimed?: boolean;
}

export interface GovernanceEligibility {
  investorRole: boolean;
  hasDepositTicket: boolean;
  hasFsftExposure: boolean;
  hasFsftVotingAttestation: boolean;
  privateFsftProofMode?: "none" | "aztec-private-proven" | "recursive-verified";
  recursiveVkConfigured?: boolean;
  canVote: boolean;
  reason: string;
  source?: string;
}

export const PROPOSAL_STATUS: Record<number, string> = {
  0: "Active",
  1: "Passed",
  2: "Failed",
  3: "Executed",
};

export async function fetchProposals(address?: string, accountIndex?: number): Promise<Proposal[]> {
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (accountIndex !== undefined) params.set("accountIndex", String(accountIndex));
  const query = params.toString();
  const res = await fetch(query ? `/api/governance/proposals?${query}` : "/api/governance/proposals");
  if (!res.ok) throw await readApiError(res, "Failed to fetch governance proposals");
  const data = await res.json();
  return data.proposals;
}

export async function castVote(
  address: string,
  proposalId: number,
  voteYes: boolean,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/governance/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, proposalId, voteYes, accountIndex }),
  });
  return res.json();
}

export async function fetchGovernanceEligibility(
  address: string,
  accountIndex = 0
): Promise<GovernanceEligibility> {
  const params = new URLSearchParams({
    address,
    accountIndex: String(accountIndex),
  });
  const res = await fetch(`/api/governance/eligibility?${params.toString()}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch governance eligibility");
  return res.json();
}

export async function attestFsftForVoting(
  address: string,
  accountIndex = 0,
  recursiveProof?: { verificationKey: unknown; proof: unknown; publicInputs: unknown[] }
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  txHash?: string;
  privateFsftProofMode?: "none" | "aztec-private-proven" | "recursive-verified";
  recursiveVkConfigured?: boolean;
}> {
  const res = await fetch("/api/governance/eligibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "attestFsftForVoting", address, accountIndex, recursiveProof }),
  });
  return res.json();
}

export async function createProposal(
  address: string,
  title: string,
  description: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; proposal?: Proposal; error?: string }> {
  const res = await fetch("/api/governance/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", address, title, description, amount, accountIndex }),
  });
  return res.json();
}

export async function finalizeProposal(
  proposalId: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/governance/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finalize", proposalId, accountIndex }),
  });
  return res.json();
}

export async function executeProposal(
  proposalId: number,
  amount = 0,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; fsftMinted?: number; error?: string }> {
  const res = await fetch("/api/governance/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "execute", proposalId, amount, accountIndex }),
  });
  return res.json();
}

export async function claimProposalDistribution(
  proposalId: number,
  address: string,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; claimedAmount?: number; txHash?: string; error?: string }> {
  const res = await fetch("/api/governance/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalId, address, accountIndex }),
  });
  return res.json();
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface PortfolioData {
  balance: number;         // FSFT token balance
  eurBalance: number;      // EUR in wallet (available to deposit)
  depositedAmount: number; // deposit ticket value in fund
  totalFundDeposits?: number;
  totalInDefi?: number;
  totalAllocated?: number;
  available?: number;
  totalSupply: number;
  sharePercent: number;
  estimatedYield: number;
  tokenPriceBps?: number;
  tokenPriceEur?: number;
  navEur?: number;
  navPerFsftEur?: number;
  fsftMarketValue?: number;
  lastAssetSalePrice?: number;
  lastFsftMinted?: number;
  fundTokenSymbol?: string;
  eurTokenSymbol?: string;
  protocolTokenBalance?: number;
  protocolTokenSymbol?: string;
  rewardsClaimable?: number;
  canTradeDex?: boolean;
  rewardsEligible?: boolean;
  governanceEligibility?: GovernanceEligibility;
  lockedEur?: number;
  lockedFsft?: number;
}

export async function fetchPortfolio(address: string, accountIndex?: number): Promise<PortfolioData> {
  const qs = new URLSearchParams({ address });
  if (accountIndex !== undefined) qs.set("accountIndex", String(accountIndex));
  const res = await fetch(`/api/portfolio?${qs.toString()}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch portfolio");
  return res.json();
}

// ── EUR / Token Balances ──────────────────────────────────────────────────────

export interface TokenInfo {
  fundToken: { symbol: string; name: string; description: string; totalSupply: number; peg?: string; decimals?: number };
  eurToken: { symbol: string; name: string; description: string; peg?: string; decimals?: number };
  protocolToken?: { symbol: string; name: string; description: string; distribution?: string; decimals?: number };
  eurBalance?: number;
  fsftBalance?: number;
  protocolBalance?: number;
  address?: string | null;
  source?: string;
}

export interface DexOrder {
  id: number;
  side: "buy" | "sell";
  owner: string;
  amount: number;
  remaining: number;
  priceEur: number;
  status: "open" | "partial" | "filled" | "cancelled" | "expired";
  createdAt: number;
  updatedAt: number;
  expiryBlock?: number;
  expiresAt?: number;
}

export interface DexTrade {
  id: number;
  buyOrderId: number;
  sellOrderId: number;
  buyer: string;
  seller: string;
  amount: number;
  priceEur: number;
  executedAt: number;
}

export interface DexOrderbook {
  priceReferenceEur: number;
  priceBandMinEur: number;
  priceBandMaxEur: number;
  buyOrders: DexOrder[];
  sellOrders: DexOrder[];
  userOrders: DexOrder[];
  recentTrades: DexTrade[];
  source?: string;
}

export interface RewardsStats {
  token: {
    symbol: string;
    totalSupply: number;
    distributionPool: number;
    years: number;
    totalEpochs: number;
  };
  weighting: {
    deposit: number;
    fsft: number;
    governance: number;
  };
  currentEpoch: number;
  lastClaimedEpoch: number;
  nextClaimableEpoch: number;
  claimableUptoEpoch: number;
  claimable: number;
  claimMin: number;
  emittedToDate: number;
  totalClaimed: number;
  totalUserClaimed?: number;
  balance: number;
  fsftRewardsAttested: boolean;
  eligibility: {
    investorRole: boolean;
    depositBucketEligible: boolean;
    fsftBucketEligible: boolean;
    governanceBucketHint: string;
    fsftRewardsAttested: boolean;
    fsftProofMode?: "none" | "aztec-private-proven" | "recursive-verified";
    recursiveVkConfigured?: boolean;
    proofGuidance?: string;
    canClaimNow: boolean;
    nextSteps: string[];
  };
  source?: string;
  nextEpochAt: number;
}

export interface RewardsOverview {
  token: {
    symbol: string;
    totalSupply: number;
    distributionPool: number;
    years: number;
    totalEpochs: number;
  };
  weighting: {
    deposit: number;
    fsft: number;
    governance: number;
  };
  curveYearlyPercents: number[];
  yearlySchedule: Array<{
    year: number;
    percent: number;
    tokens: number;
  }>;
  currentEpoch: number;
  claimMin: number;
  emittedToDate: number;
  totalClaimed: number;
  remainingPool: number;
  epochsRemaining: number;
  nextEpochAt: number;
  source?: string;
}

export interface RewardsEpoch {
  epoch: number;
  open: boolean;
  emission: number;
  allocated: number;
  claimMin: number;
}

export interface RewardsClaim {
  success: boolean;
  claimed?: number;
  txHash?: string;
  message?: string;
  error?: string;
}

export async function fetchDexOrderbook(address?: string, accountIndex?: number): Promise<DexOrderbook> {
  const query = new URLSearchParams();
  if (address) query.set("address", address);
  if (accountIndex !== undefined) query.set("accountIndex", String(accountIndex));
  const encoded = query.toString();
  const url = encoded ? `/api/dex/orders?${encoded}` : "/api/dex/orders";
  const res = await fetch(url);
  if (!res.ok) throw await readApiError(res, "Failed to fetch DEX orderbook");
  return res.json();
}

export async function placeDexOrder(
  address: string,
  side: "buy" | "sell",
  amount: number,
  limitPriceEur?: number,
  accountIndex = 0,
  ttlBlocks?: number
): Promise<{ success: boolean; message?: string; error?: string; order?: DexOrder }> {
  const res = await fetch("/api/dex/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, side, amount, limitPriceEur, accountIndex, ttlBlocks }),
  });
  return res.json();
}

/**
 * FSFTDex V3: claim the proceeds (and/or refunds) accrued to one of your orders'
 * anonymous owner_tag. Matching itself is automatic on-chain at placement, so
 * there is no separate match call. `token`: "eur" | "fsft".
 */
export async function claimDexProceeds(
  address: string,
  seq: number,
  token: "eur" | "fsft",
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string; txHash?: string }> {
  const res = await fetch("/api/dex/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, orderId: seq, token, accountIndex }),
  });
  return res.json();
}

export async function cancelDexOrder(
  address: string,
  orderId: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/dex/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, orderId, accountIndex }),
  });
  return res.json();
}

export async function fetchRewardsStats(address: string, accountIndex = 0): Promise<RewardsStats> {
  const query = new URLSearchParams({ address, accountIndex: String(accountIndex) });
  const res = await fetch(`/api/rewards/stats?${query.toString()}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch rewards stats");
  return res.json();
}

export async function fetchRewardsOverview(): Promise<RewardsOverview> {
  const res = await fetch("/api/rewards/overview");
  if (!res.ok) throw await readApiError(res, "Failed to fetch rewards overview");
  return res.json();
}

export async function claimRewards(address: string, accountIndex = 0): Promise<RewardsClaim> {
  const res = await fetch("/api/rewards/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, accountIndex }),
  });
  return res.json();
}

export async function attestFsftForRewards(
  address: string,
  accountIndex = 0,
  recursiveProof?: { verificationKey: unknown; proof: unknown; publicInputs: unknown[] }
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  txHash?: string;
  fsftProofMode?: "none" | "aztec-private-proven" | "recursive-verified";
  recursiveVkConfigured?: boolean;
}> {
  const res = await fetch("/api/rewards/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, accountIndex, recursiveProof }),
  });
  return res.json();
}

export interface PropertyDeed {
  proposalId: number;
  tokenId: number;
  owner: string;
  valuationEur: number;
  distributionOpen: boolean;
}

/** Real-estate deed NFTs (AIP-721) held by the housing fund. */
export async function fetchProperties(): Promise<PropertyDeed[]> {
  const res = await fetch("/api/property", { cache: "no-store" });
  if (!res.ok) throw await readApiError(res, "Failed to fetch properties");
  const data = await res.json();
  return (data.properties ?? []) as PropertyDeed[];
}

export async function fetchTokenInfo(address?: string): Promise<TokenInfo> {
  const url = address
    ? `/api/fund/tokens?address=${encodeURIComponent(address)}`
    : "/api/fund/tokens";
  const res = await fetch(url);
  if (!res.ok) throw await readApiError(res, "Failed to fetch token info");
  return res.json();
}

/**
 * Drip test EUR to the connected account via the Dripper faucet (AIP-20).
 * The faucet mints to the caller, so `address` must be the active account.
 */
export async function requestTestEur(
  address: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string; txHash?: string }> {
  const res = await fetch("/api/fund/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount, accountIndex }),
  });
  return res.json();
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<string[]> {
  const res = await fetch("/api/wallet/accounts");
  if (!res.ok) throw await readApiError(res, "Failed to fetch wallet accounts");
  const data = await res.json();
  return data.accounts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatEURDecimals(amount: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export interface ChainParams {
  timing: {
    aztecSlotDurationSec: number;
    ethereumSlotDurationSec: number;
    epochDurationSlots: number;
    epochDurationSec: number;
    blockProductionMode: "on-demand" | "steady";
  };
  governance: {
    votingWindowBlocks: number;
    votingWindowSecondsEstimate: number;
    minQuorumVotes: number;
  };
  dex: { priceBandBps: number; maxTtlBlocks: number; maxTtlSecondsEstimate: number };
  rewards: { claimMin: number };
}

export async function fetchChainParams(): Promise<ChainParams> {
  const res = await fetch("/api/chain/params", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load chain params (${res.status})`);
  return res.json();
}
