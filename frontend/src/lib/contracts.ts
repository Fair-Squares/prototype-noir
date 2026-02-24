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
}

export async function fetchFundStats(): Promise<FundStats> {
  const res = await fetch("/api/fund/stats");
  if (!res.ok) throw new Error("Failed to fetch fund stats");
  return res.json();
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export async function depositFunds(
  address: string,
  amount: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/fund/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount }),
  });
  return res.json();
}

export async function withdrawFunds(
  address: string,
  amount: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/fund/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount }),
  });
  return res.json();
}

// ── KYC Status ────────────────────────────────────────────────────────────────

export async function fetchKYCStatus(address: string): Promise<boolean> {
  const res = await fetch(`/api/kyc/status?address=${encodeURIComponent(address)}`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.verified;
}

export async function registerKYC(
  userAddress: string,
  devMode = false
): Promise<{ success: boolean; error?: string }> {
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
  deadline: number; // unix timestamp
  createdAt: number;
}

export const PROPOSAL_STATUS: Record<number, string> = {
  0: "Active",
  1: "Passed",
  2: "Failed",
  3: "Executed",
};

export async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch("/api/governance/proposals");
  if (!res.ok) return [];
  const data = await res.json();
  return data.proposals;
}

export async function castVote(
  address: string,
  proposalId: number,
  voteYes: boolean
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/governance/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, proposalId, voteYes }),
  });
  return res.json();
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface PortfolioData {
  balance: number;
  totalSupply: number;
  sharePercent: number;
  estimatedYield: number;
}

export async function fetchPortfolio(address: string): Promise<PortfolioData> {
  const res = await fetch(`/api/portfolio?address=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error("Failed to fetch portfolio");
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
