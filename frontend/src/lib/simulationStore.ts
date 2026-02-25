/**
 * simulationStore.ts — In-memory state for simulation mode (Vercel / no Aztec node).
 *
 * All amounts are in EUR/FSFT (no decimals — integers).
 *
 * Initial state mirrors what the bootstrap produces on a fresh local run:
 *   - 3 test accounts pre-seeded with EUR
 *   - Housing fund has test0's initial deposit (500 000 EUR)
 *   - FSFT total_supply = 0 (minted only on asset acquisition)
 */

// ── Accounts ─────────────────────────────────────────────────────────────────

export const SIM_ACCOUNTS = [
  { index: 0, alias: "test0 (admin)", address: "0x089323ce9a610e9f013b661ce80dde444b554e9f6ed9f5167adb234668f0af72", isAdmin: true },
  { index: 1, alias: "test1",         address: "0x1000000000000000000000000000000000000000000000000000000000000001", isAdmin: false },
  { index: 2, alias: "test2",         address: "0x1000000000000000000000000000000000000000000000000000000000000002", isAdmin: false },
];

// ── State ─────────────────────────────────────────────────────────────────────

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
  totalYield: number;
}

interface SimAccountState {
  eurBalance: number;   // private EUR wallet balance
  fsftBalance: number;  // private FSFT balance (fund shares)
  kycVerified: boolean;
  depositedAmount: number; // total deposited to housing fund
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
  votedBy: string[]; // addresses that have voted
}

interface SimState {
  fund: SimFundState;
  accounts: Record<string, SimAccountState>;
  proposals: SimProposal[];
  nextProposalId: number;
}

function votingWindowSeconds(): number {
  const mins = Number(process.env.GOVERNANCE_VOTING_WINDOW_MINUTES ?? "5");
  if (!Number.isFinite(mins) || mins <= 0) return 5 * 60;
  return Math.max(60, Math.floor(mins * 60));
}

// ── Singleton ─────────────────────────────────────────────────────────────────

function createInitialState(): SimState {
  const accounts: Record<string, SimAccountState> = {};

  // test0: had 600 000 EUR, deposited 500 000, keeps 100 000
  accounts[SIM_ACCOUNTS[0].address] = {
    eurBalance: 100_000,
    fsftBalance: 0,
    kycVerified: true, // admin is always KYC'd
    depositedAmount: 500_000,
  };
  // test1: 50 000 EUR, not yet deposited
  accounts[SIM_ACCOUNTS[1].address] = {
    eurBalance: 50_000,
    fsftBalance: 0,
    kycVerified: false,
    depositedAmount: 0,
  };
  // test2: 50 000 EUR, not yet deposited
  accounts[SIM_ACCOUNTS[2].address] = {
    eurBalance: 50_000,
    fsftBalance: 0,
    kycVerified: false,
    depositedAmount: 0,
  };

  return {
    fund: {
      totalDeposits: 500_000, // test0's initial deposit
      totalInDefi: 0,
      totalAllocated: 0,
      fsftTotalSupply: 0,     // no asset acquired yet
      lastAssetSalePrice: 0,
      lastFsftMinted: 0,
      tokenPriceBps: 10_000,
      isPaused: false,
      investorCount: 1,       // test0
      totalYield: 0,
    },
    accounts,
    proposals: [],
    nextProposalId: 0,
  };
}

// Server-side singleton (resets per process restart)
let _state: SimState | null = null;

function getState(): SimState {
  if (!_state) _state = createInitialState();
  return _state;
}

function getOrCreateAccount(address: string): SimAccountState {
  const s = getState();
  if (!s.accounts[address]) {
    s.accounts[address] = { eurBalance: 50_000, fsftBalance: 0, kycVerified: false, depositedAmount: 0 };
  }
  return s.accounts[address];
}

// ── Fund stats ────────────────────────────────────────────────────────────────

export function simGetFundStats() {
  const { fund } = getState();
  return {
    totalDeposits: fund.totalDeposits,
    totalInDefi: fund.totalInDefi,
    totalAllocated: fund.totalAllocated,
    available: Math.max(0, fund.totalDeposits - fund.totalInDefi - fund.totalAllocated),
    fsftTotalSupply: fund.fsftTotalSupply,
    totalSupply: fund.fsftTotalSupply,
    lastAssetSalePrice: fund.lastAssetSalePrice,
    lastFsftMinted: fund.lastFsftMinted,
    tokenPriceBps: fund.tokenPriceBps,
    isPaused: fund.isPaused,
    investorCount: fund.investorCount,
    totalYield: fund.totalYield,
    source: "simulation" as const,
  };
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export function simGetPortfolio(address: string) {
  const acct = getOrCreateAccount(address);
  const { fund } = getState();
  const sharePercent =
    fund.fsftTotalSupply > 0
      ? (acct.fsftBalance / fund.fsftTotalSupply) * 100
      : 0;
  const tokenPriceEur = fund.tokenPriceBps / 10000;
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
    estimatedYield: Math.round(acct.depositedAmount * 0.03),
    tokenPriceBps: fund.tokenPriceBps,
    tokenPriceEur,
    fsftMarketValue: Math.round(acct.fsftBalance * tokenPriceEur * 100) / 100,
    lastAssetSalePrice: fund.lastAssetSalePrice,
    lastFsftMinted: fund.lastFsftMinted,
    source: "simulation" as const,
  };
}

// ── Deposit ───────────────────────────────────────────────────────────────────

export function simDeposit(address: string, amount: number): { success: boolean; error?: string } {
  const s = getState();
  const acct = getOrCreateAccount(address);

  if (s.fund.isPaused) return { success: false, error: "Fund is paused" };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  if (acct.eurBalance < amount) return { success: false, error: "Insufficient EUR balance" };
  if (!acct.kycVerified) return { success: false, error: "KYC verification required" };

  acct.eurBalance -= amount;
  acct.depositedAmount += amount;
  s.fund.totalDeposits += amount;

  // Count unique depositors
  const allAddresses = Object.keys(s.accounts);
  s.fund.investorCount = allAddresses.filter((a) => (s.accounts[a]?.depositedAmount ?? 0) > 0).length;

  return { success: true };
}

// ── Withdraw ──────────────────────────────────────────────────────────────────

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

  const allAddresses = Object.keys(s.accounts);
  s.fund.investorCount = allAddresses.filter((a) => (s.accounts[a]?.depositedAmount ?? 0) > 0).length;

  return { success: true };
}

// ── KYC ───────────────────────────────────────────────────────────────────────

export function simGetKYCStatus(address: string): boolean {
  return getOrCreateAccount(address).kycVerified;
}

export function simSetKYCVerified(address: string): void {
  const acct = getOrCreateAccount(address);
  acct.kycVerified = true;
  // Grant EUR if they have none (new user joining via KYC)
  if (acct.eurBalance === 0 && acct.depositedAmount === 0) {
    acct.eurBalance = 50_000;
  }
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
): SimProposal {
  const s = getState();
  const id = s.nextProposalId++;
  const proposal: SimProposal = {
    id,
    title,
    description,
    descHash: "0x" + Buffer.from(title).toString("hex").padStart(64, "0").slice(0, 64),
    amount,
    yesVotes: 0,
    noVotes: 0,
    status: 0, // active
    deadline: Math.floor(Date.now() / 1000) + votingWindowSeconds(),
    createdAt: Math.floor(Date.now() / 1000),
    proposer: proposerAddress,
    votedBy: [],
  };
  s.proposals.push(proposal);
  return proposal;
}

export function simCastVote(
  address: string,
  proposalId: number,
  voteYes: boolean
): { success: boolean; error?: string } {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 0) return { success: false, error: "Proposal is not active" };
  if (proposal.votedBy.includes(address)) return { success: false, error: "Already voted" };

  proposal.votedBy.push(address);
  if (voteYes) proposal.yesVotes++;
  else proposal.noVotes++;

  return { success: true };
}

export function simFinalizeProposal(proposalId: number): { success: boolean; error?: string } {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 0) return { success: false, error: "Proposal is not active" };
  if (Math.floor(Date.now() / 1000) < proposal.deadline) {
    return { success: false, error: "Voting window is still open" };
  }
  if (proposal.yesVotes + proposal.noVotes === 0) return { success: false, error: "No votes cast yet" };

  proposal.status = proposal.yesVotes > proposal.noVotes ? 1 : 2;
  return { success: true };
}

export function simExecuteProposal(proposalId: number): { success: boolean; error?: string; fsftMinted?: number } {
  const s = getState();
  const proposal = s.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 1) return { success: false, error: "Proposal must be Passed first (finalize it)" };

  const available = s.fund.totalDeposits - s.fund.totalInDefi - s.fund.totalAllocated;
  if (proposal.amount > available) return { success: false, error: "Insufficient available fund balance" };

  proposal.status = 3; // executed
  s.fund.totalAllocated += proposal.amount;

  // FSFT minting: pro-rata to investor deposit tickets.
  const fsftToMint = proposal.amount;
  const investors = Object.entries(s.accounts)
    .filter(([, acct]) => acct.depositedAmount > 0)
    .map(([address, acct]) => ({ address, deposit: acct.depositedAmount }));

  if (investors.length === 0) return { success: false, error: "No investors to distribute to" };

  let distributed = 0;
  for (const inv of investors) {
    const minted = Math.floor((fsftToMint * inv.deposit) / s.fund.totalDeposits);
    if (minted > 0) {
      s.accounts[inv.address].fsftBalance += minted;
      distributed += minted;
    }
  }
  const remainder = fsftToMint - distributed;
  if (remainder > 0) {
    s.accounts[investors[0].address].fsftBalance += remainder;
    distributed += remainder;
  }

  s.fund.fsftTotalSupply += distributed;
  s.fund.lastAssetSalePrice = proposal.amount;
  s.fund.lastFsftMinted = distributed;
  s.fund.tokenPriceBps = Math.floor((proposal.amount * 10000) / Math.max(distributed, 1));

  return { success: true, fsftMinted: distributed };
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export function simGetAccounts() {
  return SIM_ACCOUNTS;
}
