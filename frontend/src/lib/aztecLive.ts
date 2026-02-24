const DEFAULT_PXE_URL = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://aztec-sandbox:8080";
const LIVE_RETRY_COOLDOWN_MS = 10_000;

export function isLiveModeEnabled(): boolean {
  return process.env.AZTEC_LIVE === "true";
}

type NodeSdk = {
  createAztecNodeClient: (url: string) => any;
  waitForNode: (node: any) => Promise<void>;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadNodeSdk(): Promise<NodeSdk> {
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
  return (await dynamicImport("@aztec/aztec.js/node")) as NodeSdk;
}

let liveClientPromise: Promise<{ node: any; pxeUrl: string }> | null = null;
let lastLiveFailureAt = 0;

async function isPxeReachable(pxeUrl: string): Promise<boolean> {
  const timeoutMs = 1200;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${pxeUrl}/status`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveClient(): Promise<{ node: any; pxeUrl: string }> {
  const now = Date.now();
  if (lastLiveFailureAt > 0 && now - lastLiveFailureAt < LIVE_RETRY_COOLDOWN_MS) {
    throw new Error("Aztec live mode cooldown active");
  }

  if (!liveClientPromise) {
    liveClientPromise = (async () => {
      const sdk = await loadNodeSdk();
      const pxeUrl = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
      const healthy = await isPxeReachable(pxeUrl);
      if (!healthy) {
        throw new Error(`Aztec PXE is not reachable at ${pxeUrl}`);
      }
      const node = sdk.createAztecNodeClient(pxeUrl);
      await withTimeout(sdk.waitForNode(node), 8000, "Aztec node connection");
      return { node, pxeUrl };
    })();
  }

  try {
    return await liveClientPromise;
  } catch (err) {
    lastLiveFailureAt = Date.now();
    liveClientPromise = null;
    throw err;
  }
}

export async function getLiveAccounts(): Promise<string[]> {
  const { node } = await getLiveClient();

  if (typeof node.getRegisteredAccounts !== "function") {
    throw new Error("getRegisteredAccounts is unavailable in this SDK client");
  }

  const accounts = await node.getRegisteredAccounts();
  return accounts.map((account: { address: { toString: () => string } }) => account.address.toString());
}

export async function getLiveKycStatus(_address: string): Promise<boolean> {
  throw new Error("KYC live reads are not wired for this SDK path yet");
}

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
  throw new Error("Fund stats live reads are not wired for this SDK path yet");
}

export async function getLivePortfolio(_address: string): Promise<{
  balance: number;
  totalSupply: number;
  sharePercent: number;
  estimatedYield: number;
}> {
  throw new Error("Portfolio live reads are not wired for this SDK path yet");
}
