/**
 * serverWallet.ts — Server-side Aztec wallet singleton.
 *
 * Uses the Node.js flavor of @aztec/wallets/embedded (in-process PXE),
 * which is resolved via package.json "exports" conditions when imported
 * in a Next.js API route (server environment).
 *
 * The browser flavor (web worker) is NEVER imported here — this file
 * is server-only. Next.config marks all @aztec/* as webpack externals so
 * they're never bundled into browser chunks.
 *
 * Initialization:
 *   1. Creates an ephemeral in-process PXE connected to http://aztec:8080
 *   2. Derives test account key material from INITIAL_TEST_* constants
 *   3. Registers test0 (admin) + test1 + test2 accounts in the PXE
 *
 * All subsequent calls reuse the cached wallet (module-level singleton).
 *
 * Usage in API routes:
 *   import { getServerWallet, getTestAccountWallet } from '@/lib/serverWallet';
 *   const wallet = await getTestAccountWallet(0); // test0 = admin
 *   const contract = await HousingFundContract.at(addr, wallet);
 *   await contract.methods.deposit(amount).send().wait();
 */

import type { Wallet } from "@aztec/aztec.js";

const AZTEC_NODE_URL = "http://aztec:8080";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountEntry {
  index: number;
  address: string;
  wallet: Wallet;
}

interface WalletSingleton {
  baseWallet: Wallet; // the embedded wallet (has PXE, account management)
  accounts: AccountEntry[];
}

// ── Module-level cache ─────────────────────────────────────────────────────────

let initPromise: Promise<WalletSingleton> | null = null;

// ── Initializer ───────────────────────────────────────────────────────────────

async function initWallet(): Promise<WalletSingleton> {
  // Dynamic imports — server only, webpack externals prevent bundling
  const { EmbeddedWallet } = await import("@aztec/wallets/embedded");
  const { getInitialTestAccountsData } = await import("@aztec/accounts/testing");
  const { AccountManager } = await import("@aztec/aztec.js");
  const { SchnorrAccountContract } = await import("@aztec/accounts/schnorr");

  // 1. Create in-process PXE → Aztec node
  console.log("[serverWallet] Creating NodeEmbeddedWallet...");
  const baseWallet = await EmbeddedWallet.create(AZTEC_NODE_URL, {
    ephemeral: true, // in-memory PXE, no disk state needed
  });
  console.log("[serverWallet] PXE ready.");

  // 2. Get deterministic test account key material (no network needed)
  console.log("[serverWallet] Loading test account data...");
  const accountsData = await getInitialTestAccountsData();
  console.log(`[serverWallet] Got ${accountsData.length} test accounts.`);

  // 3. Register each account in the PXE and get per-account wallets
  const accounts: AccountEntry[] = [];
  for (const [i, data] of accountsData.entries()) {
    const accountContract = new SchnorrAccountContract(data.signingKey);
    const mgr = await AccountManager.create(
      baseWallet,
      data.secret,
      accountContract,
      data.salt
    );

    // register() adds the account to PXE so private notes can be decrypted
    const acctWallet = await mgr.register();
    const address = acctWallet.getAddress().toString();

    accounts.push({ index: i, address, wallet: acctWallet });
    console.log(`[serverWallet] Registered test${i}: ${address}`);
  }

  return { baseWallet, accounts };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the full wallet singleton (lazy-initialized once).
 * Throws if the Aztec node is unreachable.
 */
export async function getServerWallet(): Promise<WalletSingleton> {
  if (!initPromise) {
    initPromise = initWallet().catch((err) => {
      // Reset so next call retries
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Returns a Wallet scoped to a specific test account.
 * accountIndex: 0 = test0 (admin), 1 = test1, 2 = test2
 */
export async function getTestAccountWallet(accountIndex = 0): Promise<Wallet> {
  const { accounts } = await getServerWallet();
  const entry = accounts.find((a) => a.index === accountIndex);
  if (!entry) {
    throw new Error(`Test account ${accountIndex} not found. Available: ${accounts.map((a) => a.index).join(", ")}`);
  }
  return entry.wallet;
}

/**
 * Returns all registered test account addresses (for use in /api/accounts).
 * Much faster than getServerWallet() on first call — waits for full init.
 */
export async function getTestAccountAddresses(): Promise<
  Array<{ index: number; address: string; isAdmin: boolean }>
> {
  const { accounts } = await getServerWallet();
  return accounts.map((a) => ({
    index: a.index,
    address: a.address,
    isAdmin: a.index === 0,
  }));
}
