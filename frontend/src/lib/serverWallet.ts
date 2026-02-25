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
 *   2. Registers local-network test accounts in the embedded wallet/PXE
 *
 * All subsequent calls reuse the cached wallet (module-level singleton).
 *
 * Usage in API routes:
 *   import { getServerWallet, getTestAccountWallet } from '@/lib/serverWallet';
 *   const { wallet, address } = await getTestAccount(0); // test0 = admin
 *   const contract = await HousingFundContract.at(addr, wallet);
 *   await contract.methods.deposit(amount).send({ from: AztecAddress.fromString(address) });
 */

import type { Wallet } from "@aztec/aztec.js/wallet";

const AZTEC_NODE_URL = "http://aztec:8080";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountEntry {
  index: number;
  address: string;
  wallet: Wallet; // shared embedded wallet; sender is selected via `from` on interactions
}

interface WalletSingleton {
  baseWallet: Wallet; // the embedded wallet (has PXE, account management)
  accounts: AccountEntry[];
}

interface WalletWithSchnorrAccounts extends Wallet {
  createSchnorrAccount: (
    secret: unknown,
    salt: unknown,
    signingKey?: unknown,
    alias?: string
  ) => Promise<{ address: { toString(): string } }>;
}

// ── Module-level cache ─────────────────────────────────────────────────────────

let initPromise: Promise<WalletSingleton> | null = null;

// ── Initializer ───────────────────────────────────────────────────────────────

async function initWallet(): Promise<WalletSingleton> {
  // Dynamic imports — server only, webpack externals prevent bundling
  const { EmbeddedWallet } = await import("@aztec/wallets/embedded");
  const { getInitialTestAccountsData } = await import("@aztec/accounts/testing");

  // 1. Create in-process PXE → Aztec node
  console.log("[serverWallet] Creating NodeEmbeddedWallet...");
  const baseWallet = await EmbeddedWallet.create(AZTEC_NODE_URL, {
    ephemeral: true, // in-memory PXE, no disk state needed
  });
  console.log("[serverWallet] PXE ready.");

  // 2. Register local-network test accounts in the wallet/PXE.
  // AccountManager.register() was removed; use createSchnorrAccount instead.
  console.log("[serverWallet] Loading deterministic test account data...");
  const testAccounts = await getInitialTestAccountsData();
  console.log(`[serverWallet] Got ${testAccounts.length} test accounts.`);

  const accounts: AccountEntry[] = [];
  const walletWithAccounts = baseWallet as WalletWithSchnorrAccounts;
  for (const [i, account] of testAccounts.entries()) {
    const created = await walletWithAccounts.createSchnorrAccount(
      account.secret,
      account.salt,
      account.signingKey
    );
    const address = created.address.toString();
    accounts.push({ index: i, address, wallet: baseWallet });
    console.log(`[serverWallet] Registered test${i}: ${address}`);
  }

  // 3. Register deployed app contracts in PXE so utility/public calls can run
  // without "Unknown contract ... add it to PXE".
  try {
    const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const node = createAztecNodeClient(AZTEC_NODE_URL);

    const registerIfPresent = async (
      label: string,
      envAddress: string,
      artifactJsonLoader: () => Promise<unknown>
    ) => {
      if (!envAddress) return;
      try {
        const address = AztecAddress.fromString(envAddress);
        const instance = await node.getContract(address);
        if (!instance) {
          console.warn(`[serverWallet] ${label} not found on node: ${envAddress}`);
          return;
        }
        const artifactJson = await artifactJsonLoader();
        const artifact = loadContractArtifact(artifactJson as Parameters<typeof loadContractArtifact>[0]);
        await baseWallet.registerContract(instance, artifact);
        console.log(`[serverWallet] Registered ${label} in PXE: ${envAddress}`);
      } catch (err) {
        console.warn(`[serverWallet] Failed to register ${label} in PXE:`, err);
      }
    };

    await Promise.all([
      registerIfPresent(
        "governance",
        process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "",
        async () => (await import("@/artifacts/governance-Governance.json")).default
      ),
      registerIfPresent(
        "housing_fund",
        process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "",
        async () => (await import("@/artifacts/housing_fund-HousingFund.json")).default
      ),
      registerIfPresent(
        "fund_token",
        process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "",
        async () => (await import("@/artifacts/fund_token-FundToken.json")).default
      ),
      registerIfPresent(
        "eur_token",
        process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "",
        async () => (await import("@/artifacts/fund_token-FundToken.json")).default
      ),
      registerIfPresent(
        "kyc_verifier",
        process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "",
        async () => (await import("@/artifacts/kyc_verifier-KYCVerifier.json")).default
      ),
      registerIfPresent(
        "defi_vault",
        process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS ?? "",
        async () => (await import("@/artifacts/defi_vault-DeFiVault.json")).default
      ),
    ]);
  } catch (err) {
    console.warn("[serverWallet] Contract registration bootstrap failed:", err);
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
  const entry = await getTestAccount(accountIndex);
  return entry.wallet;
}

export async function getTestAccount(
  accountIndex = 0
): Promise<{ index: number; address: string; isAdmin: boolean; wallet: Wallet }> {
  const { accounts } = await getServerWallet();
  const entry = accounts.find((a) => a.index === accountIndex);
  if (!entry) {
    throw new Error(`Test account ${accountIndex} not found. Available: ${accounts.map((a) => a.index).join(", ")}`);
  }
  return { index: entry.index, address: entry.address, isAdmin: entry.index === 0, wallet: entry.wallet };
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
