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
 *   1. Creates an ephemeral in-process PXE connected to the configured PXE URL
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
import { resolveServerPxeUrl } from "@/lib/pxeUrl";

const AZTEC_NODE_URL = resolveServerPxeUrl();

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
  const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

  // 1. Create in-process PXE → Aztec node
  console.log("[serverWallet] Creating NodeEmbeddedWallet...");
  // Proving (~4s/tx ClientIVC) is unnecessary on a local network. The fast dev
  // profile sets PXE_PROVER_ENABLED=false; default true stays testnet-realistic.
  const proverEnabled = process.env.PXE_PROVER_ENABLED !== "false";
  const baseWallet = await EmbeddedWallet.create(AZTEC_NODE_URL, {
    ephemeral: true, // in-memory PXE, no disk state needed
    pxe: { proverEnabled },
  });
  console.log(`[serverWallet] PXE ready (proverEnabled=${proverEnabled}).`);

  // Local-network gas prices are volatile under the fast-slot tuning. The
  // default minFeePadding (0.5 → maxFeesPerGas = 1.5x currentMinFees) is too
  // low: minFees can spike several-fold between the wallet computing maxFees
  // and the public processor reading gasFees, tripping the
  // `maxFeesPerGas >= gasFees` assertion in computeEffectiveGasFees and making
  // public #[view] simulations fail intermittently. Match the bootstrap's
  // WALLET_MIN_FEE_PADDING=30 (maxFees = 31x minFees). maxPriorityFeesPerGas
  // stays 0, so this only raises the cap — actual fees paid are unchanged.
  const feePadding = Number(process.env.WALLET_MIN_FEE_PADDING ?? "30");
  (baseWallet as unknown as { setMinFeePadding: (v: number) => void }).setMinFeePadding(feePadding);
  console.log(`[serverWallet] minFeePadding set to ${feePadding}`);

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
        async () => loadGeneratedArtifactJson("governance-Governance.json")
      ),
      registerIfPresent(
        "housing_fund",
        process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("housing_fund-HousingFund.json")
      ),
      registerIfPresent(
        "fund_token",
        process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("token_contract-Token.json")
      ),
      registerIfPresent(
        // EUR is now an AIP-20 token from the vendored aztec-standards.
        "eur_token",
        process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("token_contract-Token.json")
      ),
      registerIfPresent(
        "dripper",
        process.env.NEXT_PUBLIC_DRIPPER_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("dripper-Dripper.json")
      ),
      registerIfPresent(
        "property_nft",
        process.env.NEXT_PUBLIC_PROPERTY_NFT_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("nft_contract-NFT.json")
      ),
      registerIfPresent(
        "kyc_verifier",
        process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json")
      ),
      registerIfPresent(
        "defi_vault",
        process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("defi_vault-DeFiVault.json")
      ),
      registerIfPresent(
        "fsft_dex",
        process.env.NEXT_PUBLIC_FSFT_DEX_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("fsft_dex-FSFTDex.json")
      ),
      registerIfPresent(
        "protocol_rewards",
        process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json")
      ),
      registerIfPresent(
        "protocol_token",
        process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "",
        async () => loadGeneratedArtifactJson("token_contract-Token.json")
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
