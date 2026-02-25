/**
 * Fair Squares — In-Memory Simulation Engine
 *
 * Simulates all contract behavior when running without the Aztec sandbox.
 * Maintains state across API route calls using globalThis persistence.
 *
 * EUR is the fund's unit of account. 1 FSFT ≡ 1 EUR.
 * Balances are stored as integer euro-cents internally for precision.
 * The UI layer converts back to EUR floats.
 */

export interface SimulationProposal {
  id: number;
  title: string;
  description: string;
  descHash: string;
  amount: number;      // EUR
  yesVotes: number;
  noVotes: number;
  status: number;      // 0=active, 1=passed, 2=failed, 3=executed
  deadline: number;    // unix timestamp
  createdAt: number;
}

export interface SimulationState {
  kycVerified: Set<string>;
  balances: Map<string, number>;   // address → EUR (fund token balance = FSFT)
  eurBalances: Map<string, number>;// address → EUR wallet balance (spendable)
  totalDeposits: number;           // total EUR in the fund
  totalInDefi: number;             // EUR currently earning yield in DeFi vault
  totalAllocated: number;          // EUR committed to housing proposals
  isPaused: boolean;
  proposals: SimulationProposal[];
  votes: Map<string, Map<number, boolean>>;  // address → proposalId → voteYes
  accounts: string[];
  nextProposalId: number;
  totalYield: number;              // cumulative EUR yield distributed
  fundTokenSymbol: string;         // FSFT
  eurTokenSymbol: string;          // EURs (simulated stablecoin)
}

// Persist across Next.js hot reloads
const GLOBAL_KEY = "__fairSquaresSimulation" as const;

// The test0 admin address from the deployed contracts
const ADMIN_ADDRESS =
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
  "0x089323ce9a610e9f013b661ce80dde444b554e9f6ed9f5167adb234668f0af72";

function createInitialState(): SimulationState {
  // In dev/demo mode, accounts include the real Aztec test account addresses.
  // These mirror what bootstrap imports as test0/test1/test2.
  const accounts = [
    ADMIN_ADDRESS,
    "0x1f0a78b7b55d1f56ce2a1dad6a3d22de8e72b62e2b0f2e3d4c5b6a7f8e9d0c1",
    "0x2e1b89c8c66e2067df3b2ebe7a4e33ef9f83c73f3c1g3f4e5d6c7b8a9f0e1d2",
  ];

  // FSFT fund token balances — what investors have in the fund
  const balances = new Map<string, number>();

  // EUR wallet balances — what investors have available to deposit
  const eurBalances = new Map<string, number>();

  // Seed: admin already deposited €500,000 as initial fund capital
  balances.set(accounts[0], 500_000);
  eurBalances.set(accounts[0], 250_000);   // remaining in wallet

  // Other demo accounts have EUR ready to invest
  eurBalances.set(accounts[1], 75_000);
  eurBalances.set(accounts[2], 30_000);

  const kycVerified = new Set<string>();
  // Admin and first account are pre-verified in dev mode
  kycVerified.add(accounts[0]);

  const now = Math.floor(Date.now() / 1000);

  const proposals: SimulationProposal[] = [
    {
      id: 1,
      title: "Oude Noorden Community Housing",
      description:
        "Acquire a 12-unit apartment building in Rotterdam Oude Noorden. " +
        "Located near public transport and schools. Building assessed at €1.2M " +
        "with potential for 4 additional units through attic conversion. " +
        "Target rent: 20% below current market rate (avg €850/mo vs €1,060 market).",
      descHash: "0xabc123def456789",
      amount: 1_200_000,
      yesVotes: 24,
      noVotes: 3,
      status: 1, // passed
      deadline: now - 86400 * 3,
      createdAt: now - 86400 * 10,
    },
    {
      id: 2,
      title: "Charlois Family Apartments",
      description:
        "Purchase and renovate a former office building in Charlois to create " +
        "8 family apartments. The building requires €200K in renovation costs " +
        "but offers excellent value in an up-and-coming neighborhood. " +
        "Expected rental yield: 3.2% annually.",
      descHash: "0xdef789abc123456",
      amount: 850_000,
      yesVotes: 15,
      noVotes: 8,
      status: 0, // active
      deadline: now + 86400 * 4,
      createdAt: now - 86400 * 2,
    },
    {
      id: 3,
      title: "Kralingen Student & Starter Housing",
      description:
        "Convert a vacant commercial property near Kralingse Plas into " +
        "20 studio apartments for students and young professionals. " +
        "Partnership with Erasmus University for tenant selection. " +
        "Estimated return: 2.8% annually, strong social impact.",
      descHash: "0x789abc123def456",
      amount: 1_500_000,
      yesVotes: 0,
      noVotes: 0,
      status: 0, // active
      deadline: now + 86400 * 12,
      createdAt: now - 3600,
    },
  ];

  // Fund stats: Admin seeded €500K. Additional simulation investors bring total to €2.45M.
  // €1.2M already allocated to the Oude Noorden proposal (passed).
  // €980K placed into DeFi vault earning yield.
  // Remaining: €270K available.
  return {
    kycVerified,
    balances,
    eurBalances,
    totalDeposits: 2_450_000,     // total FSFT in circulation = total EUR invested
    totalInDefi: 980_000,
    totalAllocated: 1_200_000,
    isPaused: false,
    proposals,
    votes: new Map(),
    accounts,
    nextProposalId: 4,
    totalYield: 18_375,           // EUR yield paid out so far (~3% × partial year)
    fundTokenSymbol: "FSFT",
    eurTokenSymbol: "EURs",
  };
}

export function getState(): SimulationState {
  if (!(globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY] =
      createInitialState();
  }
  return (globalThis as unknown as Record<string, unknown>)[
    GLOBAL_KEY
  ] as SimulationState;
}

export function resetState(): void {
  (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY] =
    createInitialState();
}

// ── KYC ──────────────────────────────────────────────────────────────────────

export function registerKYC(
  address: string
): { success: boolean; error?: string } {
  const state = getState();
  if (state.kycVerified.has(address)) {
    return { success: false, error: "Already KYC verified" };
  }
  state.kycVerified.add(address);
  return { success: true };
}

export function isKYCVerified(address: string): boolean {
  const state = getState();
  // In dev mode, always verify the admin address
  if (address === ADMIN_ADDRESS) return true;
  return state.kycVerified.has(address);
}

// ── EUR wallet balance ────────────────────────────────────────────────────────

/**
 * How much EUR the user has available in their wallet (not yet in fund).
 * In reality this would be an ERC-20 or Aztec private note.
 */
export function getEurBalance(address: string): number {
  return getState().eurBalances.get(address) ?? 10_000; // default demo amount
}

/**
 * Seed a new wallet with demo EUR so they can try the invest flow.
 */
export function seedEurBalance(address: string, amount = 50_000): void {
  const state = getState();
  if (!state.eurBalances.has(address)) {
    state.eurBalances.set(address, amount);
  }
}

// ── Fund deposits/withdrawals ─────────────────────────────────────────────────

export function deposit(
  address: string,
  amount: number
): { success: boolean; message?: string; error?: string } {
  const state = getState();
  if (!state.kycVerified.has(address) && address !== ADMIN_ADDRESS) {
    return { success: false, error: "KYC verification required before investing" };
  }
  if (state.isPaused) {
    return { success: false, error: "Fund is currently paused" };
  }
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const eurWallet = getEurBalance(address);
  if (amount > eurWallet) {
    return {
      success: false,
      error: `Insufficient EUR balance. You have ${eurWallet.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })} available.`,
    };
  }

  // Deduct from EUR wallet, credit FSFT
  state.eurBalances.set(address, eurWallet - amount);
  const current = state.balances.get(address) ?? 0;
  state.balances.set(address, current + amount);
  state.totalDeposits += amount;

  // Route part to DeFi vault (40%) for yield
  state.totalInDefi = Math.floor(state.totalDeposits * 0.4);

  return {
    success: true,
    message: `Deposited ${amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}. You received ${amount} FSFT.`,
  };
}

export function withdraw(
  address: string,
  amount: number
): { success: boolean; message?: string; error?: string } {
  const state = getState();
  if (state.isPaused) {
    return { success: false, error: "Fund is currently paused" };
  }
  const current = state.balances.get(address) ?? 0;
  if (amount > current) {
    return {
      success: false,
      error: `Insufficient fund balance. You have ${current} FSFT (= ${current.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}).`,
    };
  }
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  // Burn FSFT, credit EUR wallet
  state.balances.set(address, current - amount);
  const eurWallet = getEurBalance(address);
  state.eurBalances.set(address, eurWallet + amount);
  state.totalDeposits -= amount;
  state.totalInDefi = Math.floor(state.totalDeposits * 0.4);

  return {
    success: true,
    message: `Withdrew ${amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}. ${amount} FSFT burned.`,
  };
}

export function getBalance(address: string): number {
  return getState().balances.get(address) ?? 0;
}

// ── Fund stats ────────────────────────────────────────────────────────────────

export function getFundStats() {
  const state = getState();
  const available = Math.max(
    0,
    state.totalDeposits - state.totalInDefi - state.totalAllocated
  );
  return {
    totalDeposits: state.totalDeposits,
    totalInDefi: state.totalInDefi,
    totalAllocated: state.totalAllocated,
    available,
    totalYield: state.totalYield,
    isPaused: state.isPaused,
    // +47 represents background simulation of other investors
    investorCount: state.kycVerified.size + 47,
    totalSupply: state.totalDeposits,  // 1 FSFT = 1 EUR
    fundTokenSymbol: state.fundTokenSymbol,
    eurTokenSymbol: state.eurTokenSymbol,
  };
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export function getPortfolio(address: string) {
  const state = getState();
  const balance = getBalance(address);
  const share =
    state.totalDeposits > 0 ? balance / state.totalDeposits : 0;
  const annualYieldRate = 0.03;
  const estimatedYield = balance * annualYieldRate;

  return {
    balance,                                // FSFT = EUR value
    eurBalance: getEurBalance(address),     // spendable EUR in wallet
    totalSupply: state.totalDeposits,
    sharePercent: share * 100,
    estimatedYield,
    fundTokenSymbol: state.fundTokenSymbol,
    eurTokenSymbol: state.eurTokenSymbol,
  };
}

// ── Governance ────────────────────────────────────────────────────────────────

export function getProposals(): SimulationProposal[] {
  return getState().proposals;
}

export function getProposal(id: number): SimulationProposal | undefined {
  return getState().proposals.find((p) => p.id === id);
}

export function castVote(
  address: string,
  proposalId: number,
  voteYes: boolean
): { success: boolean; error?: string } {
  const state = getState();

  if (!state.kycVerified.has(address) && address !== ADMIN_ADDRESS) {
    return { success: false, error: "KYC verification required to vote" };
  }

  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };
  if (proposal.status !== 0) return { success: false, error: "Proposal is not active" };
  if (proposal.deadline < Math.floor(Date.now() / 1000)) {
    return { success: false, error: "Voting period has ended" };
  }

  if (!state.votes.has(address)) state.votes.set(address, new Map());
  const userVotes = state.votes.get(address)!;
  if (userVotes.has(proposalId)) {
    return { success: false, error: "Already voted (nullifier exists on-chain)" };
  }

  userVotes.set(proposalId, voteYes);
  if (voteYes) proposal.yesVotes++;
  else proposal.noVotes++;

  return { success: true };
}

export function createProposal(
  title: string,
  description: string,
  amount: number,
  deadlineDays: number
): { success: boolean; proposal?: SimulationProposal; error?: string } {
  const state = getState();
  const now = Math.floor(Date.now() / 1000);
  const proposal: SimulationProposal = {
    id: state.nextProposalId++,
    title,
    description,
    descHash: `0x${Math.random().toString(16).slice(2, 18)}`,
    amount,
    yesVotes: 0,
    noVotes: 0,
    status: 0,
    deadline: now + deadlineDays * 86400,
    createdAt: now,
  };
  state.proposals.unshift(proposal);
  return { success: true, proposal };
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export function getAccounts(): string[] {
  return getState().accounts;
}

// ── EUR token info ────────────────────────────────────────────────────────────

export function getTokenInfo() {
  return {
    fundToken: {
      symbol: "FSFT",
      name: "Fair Squares Fund Token",
      description: "1 FSFT = 1 EUR invested in the housing fund. Redeemable at any time.",
      totalSupply: getState().totalDeposits,
    },
    eurToken: {
      symbol: "EURs",
      name: "EUR Stablecoin",
      description: "EUR-pegged stablecoin used for fund deposits. Backed 1:1 by EUR.",
      network: "Aztec (private)",
    },
  };
}
