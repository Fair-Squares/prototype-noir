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

/** POST JSON and parse the response. Non-2xx responses throw with the API's
 * error message (same convention as the GET helpers) — so an HTML error page
 * or proxy failure surfaces as a clear Error instead of a JSON SyntaxError,
 * and callers never act on an error body as if it were a success payload. */
async function postJson<T>(url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readApiError(res, fallbackMessage);
  return res.json() as Promise<T>;
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
  /** Cumulative on-chain rent income recorded via HousingFund.record_rent. REAL. */
  totalRentIncome?: number;
  /** Return on Rent in basis points (HousingFund.ror_bps). REAL — rent = ROR × acquisition. */
  rorBps?: number;
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
  return postJson("/api/fund/deposit", { address, amount, accountIndex }, "Deposit failed");
}

export async function withdrawFunds(
  address: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  return postJson("/api/fund/withdraw", { address, amount, accountIndex }, "Withdrawal failed");
}

// ── KYC Status ────────────────────────────────────────────────────────────────

export interface KYCProfile {
  verified: boolean;
  isInvestor: boolean;
  /** J1/J2 journey roles (property listings + council review). */
  isPropertyOwner?: boolean;
  isCouncil?: boolean;
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

  const record = data as Record<string, unknown>;
  return {
    verified: data.verified,
    isInvestor: data.isInvestor,
    isPropertyOwner: typeof record.isPropertyOwner === "boolean" ? record.isPropertyOwner : undefined,
    isCouncil: typeof record.isCouncil === "boolean" ? record.isCouncil : undefined,
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
  devMode = false,
  journeyRoles: Array<"property_owner" | "council"> = []
): Promise<{ success: boolean; error?: string; message?: string; verified?: boolean; isInvestor?: boolean; roles?: string[] }> {
  return postJson("/api/kyc/register", { userAddress, devMode, journeyRoles }, "KYC registration failed");
}

// ── J1/J2: property listings + council review ────────────────────────────────

export interface Listing {
  id: number;
  proposer: string;
  askEur: number;
  /** Appraiser-attested MONTHLY market rent (EUR) — the affordability baseline anchor. */
  marketRentRefEur: number;
  dossierHash: string;
  status: number; // 1=submitted, 2=council approved, 3=proposed, 4=rejected
  statusName: string;
  approvals: number;
  qualityScore: number;
  proposalId: number | null;
}

export async function fetchListings(): Promise<Listing[]> {
  const res = await fetch("/api/property/listings");
  if (!res.ok) throw await readApiError(res, "Failed to fetch listings");
  const data = (await res.json()) as { listings?: unknown };
  if (!Array.isArray(data.listings)) {
    throw new Error("Listings response missing `listings` array");
  }
  return data.listings as Listing[];
}

export async function submitListing(
  address: string,
  askEur: number,
  marketRentRefEur: number,
  dossierHash: string,
  accountIndex = 0
): Promise<{ success: boolean; listingId?: number; message?: string; txHash?: string; error?: string }> {
  return postJson(
    "/api/property/listings",
    { address, askEur, marketRentRefEur, dossierHash, accountIndex },
    "Listing submission failed"
  );
}

export async function councilReview(
  address: string,
  listingId: number,
  action: "approve" | "reject",
  qualityScore?: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; txHash?: string; error?: string }> {
  return postJson(
    "/api/governance/council",
    { address, listingId, action, qualityScore, accountIndex },
    `Council ${action} failed`
  );
}

export async function createProposalFromListing(
  address: string,
  listingId: number,
  title: string,
  description: string,
  accountIndex = 0
): Promise<{ success: boolean; proposal?: Proposal; message?: string; txHash?: string; error?: string }> {
  return postJson(
    "/api/governance/proposals",
    { action: "create_from_listing", address, listingId, title, description, accountIndex },
    "Opening the investor vote failed"
  );
}

// ── Governance ────────────────────────────────────────────────────────────────

/** On-chain affordability covenant attached to a proposal (W1). Present when a
 *  proposer has called Governance.set_proposal_covenant; the numeric terms are
 *  REAL on-chain values (rendered untagged / "on-chain"), unlike the descriptive
 *  dossier covenant (rent band / target group prose), which stays modelled. */
export interface ProposalCovenant {
  isSet: boolean;
  /** Max ANNUAL rent, bps of acquisition value (enforced by record_rent). */
  rentCeilingBps: number;
  lockYears: number;
}

export interface Proposal {
  id: number;
  title: string;
  description: string;
  descHash: string;
  amount: number;
  yesVotes: number;
  noVotes: number;
  // On-chain enum integer. Render ONLY via proposalLifecycle.displayStatus()
  // (source of truth), which maps it to the canonical labels:
  //   0 → "Voting open" (or "Voting ended" once the deadline block passes)
  //   1 → "Approved"  ·  2 → "Rejected"  ·  3 → "Funded"
  // Never surface the raw enum words (Active/Passed/Failed/Executed).
  status: number;
  deadline: number; // block number (live) or unix seconds (simulation — see deadlineKind)
  createdAt: number; // block number (legacy alias)
  /** "timestamp" = `deadline` is unix seconds (simulation mode); absent/"block"
   * = block heights (live mode). proposalLifecycle.votingWindowFor branches on
   * this so sim windows actually close and timestamps never render as blocks. */
  deadlineKind?: "block" | "timestamp";
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
  /** Live mode: the connected account holds ≥1 PRIVATE deposit note. Private
   * amounts aren't publicly readable, so claimableAmount (from public records)
   * is not a reliable "you have nothing" signal — the UI shows a claim prompt
   * instead of a misleading €0. */
  hasPrivateDeposits?: boolean;
  /** On-chain affordability covenant (W1), when one is attached + set. */
  covenant?: ProposalCovenant;
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
  return postJson("/api/governance/vote", { address, proposalId, voteYes, accountIndex }, "Vote failed");
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
  return postJson(
    "/api/governance/eligibility",
    { action: "attestFsftForVoting", address, accountIndex, recursiveProof },
    "FSFT voting attestation failed"
  );
}

export async function createProposal(
  address: string,
  title: string,
  description: string,
  amount: number,
  accountIndex = 0
): Promise<{ success: boolean; proposal?: Proposal; error?: string }> {
  return postJson(
    "/api/governance/proposals",
    { action: "create", address, title, description, amount, accountIndex },
    "Proposal creation failed"
  );
}

export async function finalizeProposal(
  proposalId: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  return postJson(
    "/api/governance/proposals",
    { action: "finalize", proposalId, accountIndex },
    "Proposal finalisation failed"
  );
}

export async function executeProposal(
  proposalId: number,
  amount = 0,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; fsftMinted?: number; error?: string }> {
  return postJson(
    "/api/governance/proposals",
    { action: "execute", proposalId, amount, accountIndex },
    "Proposal execution failed"
  );
}

export async function claimProposalDistribution(
  proposalId: number,
  address: string,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; claimedAmount?: number; txHash?: string; error?: string }> {
  return postJson(
    "/api/governance/claim",
    { proposalId, address, accountIndex },
    "Distribution claim failed"
  );
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
  /** Holder's lifetime EARNED pro-rata rent (record_rent), not an APY. */
  estimatedYield: number;
  /** Same as estimatedYield — lifetime earned rent (pro-rata of pooled rent). */
  rentEarned?: number;
  /** Unclaimed rent the holder can withdraw or reinvest = earned − withdrawn − reinvested. */
  rentClaimable?: number;
  /** Rent already taken as fiat (withdraw side of the ledger). */
  rentWithdrawn?: number;
  /** Rent already reinvested back into the fund (reinvest side of the ledger). */
  rentReinvested?: number;
  tokenPriceBps?: number;
  tokenPriceEur?: number;
  navEur?: number;
  navPerFsftEur?: number;
  totalRentIncome?: number;
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
  /** "live" | "simulation" — gates live-only affordances (e.g. reinvest). */
  source?: string;
}

export async function fetchPortfolio(address: string, accountIndex?: number): Promise<PortfolioData> {
  const qs = new URLSearchParams({ address });
  if (accountIndex !== undefined) qs.set("accountIndex", String(accountIndex));
  const res = await fetch(`/api/portfolio?${qs.toString()}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch portfolio");
  return res.json();
}

/** Withdraw the holder's claimable rent as fiat (HousingFund.claim_rent). */
export async function claimRent(
  address: string,
  accountIndex = 0
): Promise<{ success: boolean; claimed?: number; error?: string; message?: string }> {
  return postJson("/api/fund/rent/claim", { address, accountIndex }, "Rent withdrawal failed");
}

/** Reinvest the holder's claimable rent back into the fund (HousingFund.reinvest_rent). */
export async function reinvestRent(
  address: string,
  accountIndex = 0
): Promise<{ success: boolean; reinvested?: number; error?: string; message?: string }> {
  return postJson("/api/fund/rent/reinvest", { address, accountIndex }, "Rent reinvest failed");
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

/**
 * One of the caller's OWN DEX orders, scanned from their PXE and enriched with
 * its live state + claimable proceeds. `seq` is internal plumbing (the UI never
 * shows it); it's only used to reference the order when claiming/cancelling.
 */
export interface MyDexOrder {
  seq: number;
  side: "buy" | "sell";
  amount: number;
  remaining: number;
  priceEur: number;
  status: "open" | "partial" | "filled" | "cancelled" | "expired";
  expiryBlock: number;
  claimableEur: number;
  claimableFsft: number;
  cancellable: boolean;
}

/**
 * Scan the caller's own DEX orders (from their PXE) with per-order status and
 * claimable EUR/FSFT — so the UI can list them with Claim/Cancel buttons instead
 * of asking the user to remember a sequence number.
 */
export async function fetchMyDexOrders(
  address: string,
  accountIndex = 0
): Promise<MyDexOrder[]> {
  const query = new URLSearchParams({ address, accountIndex: String(accountIndex) });
  const res = await fetch(`/api/dex/my-orders?${query.toString()}`);
  if (!res.ok) throw await readApiError(res, "Failed to fetch your DEX orders");
  const data = (await res.json()) as { orders?: MyDexOrder[] };
  // A missing field is a malformed response, not "no orders" — don't render an
  // empty book over a broken API (no fallback that lies).
  if (!Array.isArray(data.orders)) {
    throw new Error("Malformed response from /api/dex/my-orders: missing orders");
  }
  return data.orders;
}

export async function placeDexOrder(
  address: string,
  side: "buy" | "sell",
  amount: number,
  limitPriceEur?: number,
  accountIndex = 0,
  ttlBlocks?: number
): Promise<{ success: boolean; message?: string; error?: string; order?: DexOrder }> {
  return postJson(
    "/api/dex/orders",
    { address, side, amount, limitPriceEur, accountIndex, ttlBlocks },
    "Order placement failed"
  );
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
  return postJson(
    "/api/dex/claim",
    { address, orderId: seq, token, accountIndex },
    "Claiming DEX proceeds failed"
  );
}

export async function cancelDexOrder(
  address: string,
  orderId: number,
  accountIndex = 0
): Promise<{ success: boolean; message?: string; error?: string }> {
  return postJson("/api/dex/cancel", { address, orderId, accountIndex }, "Order cancel failed");
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
  return postJson("/api/rewards/claim", { address, accountIndex }, "Rewards claim failed");
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
  return postJson(
    "/api/rewards/attest",
    { address, accountIndex, recursiveProof },
    "FSFT rewards attestation failed"
  );
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
  // A missing field is a malformed response, not "no properties".
  if (!Array.isArray(data.properties)) {
    throw new Error("Malformed response from /api/property: missing properties");
  }
  return data.properties as PropertyDeed[];
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
  return postJson("/api/fund/tokens", { address, amount, accountIndex }, "EUR faucet drip failed");
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

/**
 * Format an FSFT (Fund Shares) amount. FSFT is a token COUNT representing
 * ownership — never a currency, so this renders e.g. "20,000 FSFT", not "€20,000".
 * Use for distribution pools/claims (minted FSFT), NOT for EUR figures like the
 * proposal funding request or rent income.
 */
export function formatFSFT(amount: number): string {
  const n = new Intl.NumberFormat("en-EU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `${n} FSFT`;
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

// Chain params are pure protocol/env config (the route does no on-chain reads) —
// identical for the whole session and fetched on 4 surfaces (Overview, DEX,
// Reference, ProofSignals). Memoize the in-flight promise so the app makes ONE
// request instead of one per mount.
let chainParamsCache: Promise<ChainParams> | null = null;
export async function fetchChainParams(): Promise<ChainParams> {
  if (!chainParamsCache) {
    chainParamsCache = fetch("/api/chain/params", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load chain params (${res.status})`);
        return res.json() as Promise<ChainParams>;
      })
      .catch((err) => {
        chainParamsCache = null; // allow retry on failure
        throw err;
      });
  }
  return chainParamsCache;
}
