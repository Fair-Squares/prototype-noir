/**
 * Aztec live-mode integration for Fair Squares.
 *
 * When AZTEC_LIVE=true and NEXT_PUBLIC_SIMULATION=false, API routes try these
 * functions first before falling back to the simulation engine.
 *
 * The PXE exposes a JSON-RPC API at /. We use direct HTTP calls for basic
 * queries (accounts, node info) and fall back to simulation for contract-level
 * reads until full TypeScript contract wrappers are generated via `aztec codegen`.
 */

const DEFAULT_PXE_URL = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://aztec:8080";
const LIVE_RETRY_COOLDOWN_MS = 10_000;

export function isLiveModeEnabled(): boolean {
  return (
    process.env.AZTEC_LIVE === "true" ||
    process.env.NEXT_PUBLIC_SIMULATION === "false"
  );
}

// -- Contract addresses from env (set by bootstrap) ---------------------------

export function getContractAddresses() {
  return {
    kycVerifier: process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "",
    fundToken: process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "",
    defiVault: process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS ?? "",
    housingFund: process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "",
    governance: process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "",
    admin: process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "",
  };
}

// -- PXE RPC helpers ----------------------------------------------------------

let lastLiveFailureAt = 0;

async function pxeRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const now = Date.now();
  if (lastLiveFailureAt > 0 && now - lastLiveFailureAt < LIVE_RETRY_COOLDOWN_MS) {
    throw new Error("Aztec live mode cooldown active");
  }

  const pxeUrl = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(pxeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`PXE RPC ${method} returned ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`PXE RPC error: ${JSON.stringify(data.error)}`);
    }
    return data.result;
  } catch (err) {
    lastLiveFailureAt = Date.now();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function isPxeReachable(): Promise<boolean> {
  const pxeUrl = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`${pxeUrl}/status`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// -- Public API ---------------------------------------------------------------

export async function getLiveAccounts(): Promise<string[]> {
  const result = await pxeRpc("pxe_getRegisteredAccounts");
  if (!Array.isArray(result)) {
    throw new Error("Unexpected response from pxe_getRegisteredAccounts");
  }
  return result.map((account: any) => {
    if (typeof account === "string") return account;
    if (account?.address) return String(account.address);
    return String(account);
  });
}

export async function getLiveNodeInfo(): Promise<{ isReady: boolean; pxeUrl: string }> {
  const pxeUrl = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
  const ready = await isPxeReachable();
  return { isReady: ready, pxeUrl };
}

/**
 * KYC status check via PXE.
 *
 * This requires a simulate call to KYCVerifier.is_verified(user).
 * Until codegen wrappers are available, we attempt a raw simulateView call.
 * If it fails, the API route will fall back to simulation.
 */
export async function getLiveKycStatus(address: string): Promise<boolean> {
  const addrs = getContractAddresses();
  if (!addrs.kycVerifier || addrs.kycVerifier === "DEPLOY_FAILED") {
    throw new Error("KYCVerifier contract address not configured");
  }

  // Attempt raw PXE simulate call for is_verified
  // The function selector for is_verified can be derived, but without codegen
  // we fall back to simulation for now
  throw new Error(
    "KYC live reads require codegen wrappers (run aztec codegen). Falling back to simulation."
  );
}

/**
 * Fund stats from HousingFund + DeFiVault contracts.
 *
 * Without codegen wrappers, we return data from simulation but annotated
 * with the live contract addresses so the frontend knows contracts are deployed.
 */
export async function getLiveFundStats(): Promise<{
  totalDeposits: number;
  totalInDefi: number;
  totalAllocated: number;
  available: number;
  totalYield: number;
  isPaused: boolean;
  investorCount: number;
  totalSupply: number;
}> {
  const addrs = getContractAddresses();
  if (!addrs.housingFund || addrs.housingFund === "DEPLOY_FAILED") {
    throw new Error("HousingFund contract address not configured");
  }

  // Without codegen wrappers, we can't call contract view functions directly.
  // Throw to fall back to simulation engine.
  throw new Error(
    "Fund stats live reads require codegen wrappers. Falling back to simulation."
  );
}

export async function getLivePortfolio(_address: string): Promise<{
  balance: number;
  totalSupply: number;
  sharePercent: number;
  estimatedYield: number;
}> {
  throw new Error(
    "Portfolio live reads require codegen wrappers. Falling back to simulation."
  );
}
