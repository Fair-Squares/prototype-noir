/**
 * Fair Squares — In-Memory Simulation Engine
 *
 * Simulates all contract behavior when running without the Aztec sandbox.
 * Maintains state across API route calls using globalThis persistence.
 *
 * When AZTEC_LIVE=true, this module is bypassed and real PXE calls are used.
 */

export interface SimulationProposal {
  id: number;
  title: string;
  description: string;
  descHash: string;
  amount: number;
  yesVotes: number;
  noVotes: number;
  status: number; // 0=active, 1=passed, 2=failed, 3=executed
  deadline: number; // unix timestamp
  createdAt: number;
}

export interface SimulationState {
  kycVerified: Set<string>;
  balances: Map<string, number>; // address -> EUR amount (float for simplicity)
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  isPaused: boolean;
  proposals: SimulationProposal[];
  votes: Map<string, Map<number, boolean>>; // address -> proposalId -> voteYes
  accounts: string[];
  nextProposalId: number;
  totalYield: number;
}

// Persist across Next.js hot reloads
const globalKey = "__fairSquaresSimulation" as const;

function createInitialState(): SimulationState {
  const accounts = [
    "0x1a2b3c4d5e6f7890abcdef1234567890abcdef01",
    "0x2b3c4d5e6f7890abcdef1234567890abcdef0102",
    "0x3c4d5e6f7890abcdef1234567890abcdef010203",
  ];

  const balances = new Map<string, number>();
  balances.set(accounts[0], 0);
  balances.set(accounts[1], 0);
  balances.set(accounts[2], 0);

  const kycVerified = new Set<string>();

  const now = Math.floor(Date.now() / 1000);

  const proposals: SimulationProposal[] = [
    {
      id: 1,
      title: "Oude Noorden Community Housing",
      description: "Acquire a 12-unit apartment building in Rotterdam Oude Noorden for affordable housing. Located near public transport and schools. Building assessed at €1.2M with potential for 4 additional units through attic conversion.",
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
      description: "Purchase and renovate a former office building in Charlois to create 8 family apartments. The building requires €200K in renovation costs but offers excellent value in an up-and-coming neighborhood.",
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
      description: "Convert a vacant commercial property near Kralingse Plas into 20 studio apartments for students and young professionals. Partnership with local university for tenant selection.",
      descHash: "0x789abc123def456",
      amount: 1_500_000,
      yesVotes: 0,
      noVotes: 0,
      status: 0, // active
      deadline: now + 86400 * 12,
      createdAt: now - 3600,
    },
  ];

  return {
    kycVerified,
    balances,
    totalDeposits: 2_450_000,
    totalInDefi: 980_000,
    totalAllocated: 1_200_000,
    isPaused: false,
    proposals,
    votes: new Map(),
    accounts,
    nextProposalId: 4,
    totalYield: 18_375,
  };
}

export function getState(): SimulationState {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = createInitialState();
  }
  return (globalThis as any)[globalKey];
}

export function resetState(): void {
  (globalThis as any)[globalKey] = createInitialState();
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function registerKYC(address: string): { success: boolean; error?: string } {
  const state = getState();
  if (state.kycVerified.has(address)) {
    return { success: false, error: "Already KYC verified" };
  }
  state.kycVerified.add(address);
  return { success: true };
}

export function isKYCVerified(address: string): boolean {
  return getState().kycVerified.has(address);
}

export function deposit(address: string, amount: number): { success: boolean; error?: string } {
  const state = getState();
  if (!state.kycVerified.has(address)) {
    return { success: false, error: "KYC verification required" };
  }
  if (state.isPaused) {
    return { success: false, error: "Fund is currently paused" };
  }
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const current = state.balances.get(address) ?? 0;
  state.balances.set(address, current + amount);
  state.totalDeposits += amount;

  return { success: true };
}

export function withdraw(address: string, amount: number): { success: boolean; error?: string } {
  const state = getState();
  if (state.isPaused) {
    return { success: false, error: "Fund is currently paused" };
  }
  const current = state.balances.get(address) ?? 0;
  if (amount > current) {
    return { success: false, error: "Insufficient balance" };
  }
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  state.balances.set(address, current - amount);
  state.totalDeposits -= amount;

  return { success: true };
}

export function getBalance(address: string): number {
  return getState().balances.get(address) ?? 0;
}

export function getFundStats() {
  const state = getState();
  const available = state.totalDeposits - state.totalInDefi - state.totalAllocated;
  return {
    totalDeposits: state.totalDeposits,
    totalInDefi: state.totalInDefi,
    totalAllocated: state.totalAllocated,
    available: Math.max(0, available),
    totalYield: state.totalYield,
    isPaused: state.isPaused,
    investorCount: state.kycVerified.size + 47, // seed: 47 existing investors
    totalSupply: state.totalDeposits, // 1:1 FSFT peg
  };
}

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

  if (!state.kycVerified.has(address)) {
    return { success: false, error: "KYC verification required to vote" };
  }

  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return { success: false, error: "Proposal not found" };
  }
  if (proposal.status !== 0) {
    return { success: false, error: "Proposal is not active" };
  }
  if (proposal.deadline < Math.floor(Date.now() / 1000)) {
    return { success: false, error: "Voting period has ended" };
  }

  // Check for double vote
  if (!state.votes.has(address)) {
    state.votes.set(address, new Map());
  }
  const userVotes = state.votes.get(address)!;
  if (userVotes.has(proposalId)) {
    return { success: false, error: "Already voted on this proposal (nullifier exists)" };
  }

  userVotes.set(proposalId, voteYes);
  if (voteYes) {
    proposal.yesVotes++;
  } else {
    proposal.noVotes++;
  }

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

export function getAccounts(): string[] {
  return getState().accounts;
}
