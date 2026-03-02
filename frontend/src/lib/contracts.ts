/**
 * Contract client — thin wrapper around API routes.
 *
 * In simulation mode (default): API routes use in-memory state.
 * In live mode (AZTEC_LIVE=true): API routes call real Aztec PXE.
 *
 * The frontend always talks to these functions, never directly to PXE.
 */

// ── Fund Stats ────────────────────────────────────────────────────────────────

export interface FundStats {
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  available: number;
  totalYield: number;
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
}

export async function fetchFundStats(): Promise<FundStats> {
  const res = await fetch("/api/fund/stats");
  if (!res.ok) throw new Error("Failed to fetch fund stats");
  return res.json();
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export async function depositFunds(
  address: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
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
  if (!res.ok) return { verified: false, isInvestor: false, roles: [] };
  const data = await res.json();
  return {
    verified: Boolean(data.verified),
    isInvestor: Boolean(data.isInvestor),
    roles: Array.isArray(data.roles) ? data.roles : [],
    source: data.source,
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
  if (!res.ok) return [];
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
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      investorRole: false,
      hasDepositTicket: false,
      hasFsftExposure: false,
      hasFsftVotingAttestation: false,
      canVote: false,
      reason: data?.error ?? "Could not fetch voting eligibility",
    };
  }
  return res.json();
}

export async function attestFsftForVoting(
  address: string,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string; txHash?: string }> {
  const res = await fetch("/api/governance/eligibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "attestFsftForVoting", address, accountIndex }),
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
  totalYield?: number;
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
  if (!res.ok) throw new Error("Failed to fetch portfolio");
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
    canClaimNow: boolean;
    nextSteps: string[];
  };
  source?: string;
  nextEpochAt: number;
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

export async function fetchDexOrderbook(address?: string): Promise<DexOrderbook> {
  const url = address
    ? `/api/dex/orders?address=${encodeURIComponent(address)}`
    : "/api/dex/orders";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch DEX orderbook");
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

export async function matchDexOrder(
  address: string,
  orderId: number,
  makerOrderId?: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/dex/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, orderId, makerOrderId, accountIndex }),
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
  if (!res.ok) throw new Error("Failed to fetch rewards stats");
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

export async function attestFsftForRewards(address: string, accountIndex = 0): Promise<{ success: boolean; message?: string; error?: string; txHash?: string }> {
  const res = await fetch("/api/rewards/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, accountIndex }),
  });
  return res.json();
}

export async function fetchTokenInfo(address?: string): Promise<TokenInfo> {
  const url = address
    ? `/api/fund/tokens?address=${encodeURIComponent(address)}`
    : "/api/fund/tokens";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch token info");
  return res.json();
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<string[]> {
  const res = await fetch("/api/wallet/accounts");
  if (!res.ok) return [];
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
