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
 * ─ SECURITY / PRIVACY POSTURE (M16) ──────────────────────────────────────────
 * This is a SINGLE shared server-side PXE that holds the keys for EVERY
 * deterministic test account. That has two consequences which are acceptable
 * for a local demo but MUST NOT be exposed to a multi-user or public testnet
 * deployment without adding authentication:
 *
 *   1. The one PXE can decrypt every account's private notes. There is no
 *      cryptographic isolation between accounts.
 *   2. API routes select the acting account purely from request-supplied
 *      parameters (`accountIndex` / `address`). "The address matches the
 *      account index" is NOT authentication — any HTTP caller can act as, or
 *      read the private state of, any account (e.g. `/api/kyc/status`).
 *
 * There is intentionally NO session/JWT auth anywhere under `src/app/api/`.
 * Before any shared/testnet exposure, add per-session challenge–signature auth
 * and derive the acting account from the authenticated session (ideally one
 * PXE / key set per browser session rather than this shared singleton).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage in API routes:
 *   import { getTestAccount } from '@/lib/serverWallet';
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
  isGenerated?: boolean; // runtime-created account (fees sponsored via SponsoredFPC)
}

/** A runtime-created account returned to the client. */
export interface GeneratedAccountResult {
  index: number;
  address: string;
  alias: string;
}

interface WalletSingleton {
  baseWallet: Wallet; // the embedded wallet (has PXE, account management)
  accounts: AccountEntry[];
  /**
   * Create + deploy a fresh Schnorr account whose fees are sponsored by the
   * canonical SponsoredFPC, register it in the PXE, and append it to `accounts`.
   * Throws if sponsorship setup was unavailable (so we never hand back a
   * non-functional account).
   */
  createGenerated: () => Promise<GeneratedAccountResult>;
}

interface SchnorrAccountManager {
  address: { toString(): string };
  getDeployMethod: () => Promise<{
    simulate: (opts: unknown) => Promise<unknown>;
    send: (opts: unknown) => Promise<{ wait?: () => Promise<unknown> } | unknown>;
  }>;
}

interface WalletWithSchnorrAccounts extends Wallet {
  createSchnorrAccount: (
    secret: unknown,
    salt: unknown,
    signingKey?: unknown,
    alias?: string
  ) => Promise<SchnorrAccountManager>;
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

  // ── Runtime account creation (sponsored fees) ────────────────────────────────
  // Accounts created at runtime (via /api/accounts/create) have no fee juice. The
  // canonical SponsoredFPC — deployed on every Aztec network at salt=0, including
  // this local-network — pays their fees. We register it and install it as the
  // wallet's FALLBACK fee payment method (BaseWallet leaves it undefined) for
  // GENERATED addresses only, so a `.send({ from })` from a new account is
  // sponsored with NO route changes, while the pre-funded test accounts keep
  // self-paying from their own fee juice (their address isn't in the set below).
  const generatedAddresses = new Set<string>();
  let nextGeneratedIndex = 1000;
  let createGenerated: () => Promise<GeneratedAccountResult> = () => {
    throw new Error(
      "Account creation unavailable: SponsoredFPC fee sponsorship was not set up on this network."
    );
  };

  try {
    const { SponsoredFeePaymentMethod } = await import("@aztec/aztec.js/fee");
    const { getContractInstanceFromInstantiationParams } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { Fr } = await import("@aztec/aztec.js/fields");
    const { AccountFeePaymentMethodOptions } = await import("@aztec/entrypoints/account");
    const { NO_FROM } = await import("@aztec/aztec.js/account");

    // @aztec/noir-contracts.js isn't a frontend dependency, so we vendor just the
    // SponsoredFPC artifact (v4.3.0). The canonical instance derives from it at
    // salt=0 — the same deterministic address the local-network deploys.
    const sponsoredFpcJson = (await import("./sponsoredFpcArtifact.json")).default;
    const sponsoredArtifact = loadContractArtifact(
      sponsoredFpcJson as unknown as Parameters<typeof loadContractArtifact>[0]
    );
    const sponsoredFpcInstance = await getContractInstanceFromInstantiationParams(
      sponsoredArtifact,
      { salt: new Fr(0) }
    );
    await baseWallet.registerContract(sponsoredFpcInstance, sponsoredArtifact);
    const sponsoredMethod = new SponsoredFeePaymentMethod(sponsoredFpcInstance.address);
    console.log(
      `[serverWallet] SponsoredFPC registered for generated accounts: ${sponsoredFpcInstance.address.toString()}`
    );

    // Patch completeFeeOptions to return the sponsored method as the wallet-level
    // fallback for generated addresses. Applies to both gas-estimation and the
    // real send (both call this), so estimation doesn't try to charge the new
    // account's empty fee juice. accountFeePaymentMethodOptions=EXTERNAL tells the
    // account entrypoint the FPC (not the account) is paying. `!feePayer` skips
    // the deploy call, which already passes the method explicitly.
    const walletAny = baseWallet as unknown as {
      completeFeeOptions: (config: {
        from?: unknown;
        feePayer?: unknown;
      }) => Promise<Record<string, unknown>>;
    };
    const origCompleteFeeOptions = walletAny.completeFeeOptions.bind(baseWallet);
    walletAny.completeFeeOptions = async (config) => {
      const base = await origCompleteFeeOptions(config);
      const from = config.from as { toString?: () => string } | undefined;
      const fromStr =
        from && from !== NO_FROM && typeof from.toString === "function"
          ? from.toString().toLowerCase()
          : null;
      if (fromStr && generatedAddresses.has(fromStr) && !config.feePayer) {
        return {
          ...base,
          walletFeePaymentMethod: sponsoredMethod,
          accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions.EXTERNAL,
        };
      }
      return base;
    };

    const walletWithSchnorr = baseWallet as WalletWithSchnorrAccounts;
    createGenerated = async (): Promise<GeneratedAccountResult> => {
      const secret = Fr.random();
      const salt = Fr.random();
      const manager = await walletWithSchnorr.createSchnorrAccount(secret, salt);
      const address = manager.address.toString();
      // Mark generated BEFORE any send so the deploy + every later tx is sponsored.
      generatedAddresses.add(address.toLowerCase());

      const deployMethod = await manager.getDeployMethod();
      // Simulate first to surface any deploy revert with a clear message.
      await deployMethod.simulate({ from: NO_FROM });
      const sent = await deployMethod.send({
        from: NO_FROM,
        fee: { paymentMethod: sponsoredMethod },
        wait: { timeout: 120 },
      });
      const maybeWait = sent as { wait?: () => Promise<unknown> };
      if (typeof maybeWait?.wait === "function") await maybeWait.wait();

      const index = nextGeneratedIndex++;
      accounts.push({ index, address, wallet: baseWallet, isGenerated: true });
      console.log(`[serverWallet] Generated account #${index} deployed (sponsored): ${address}`);
      return { index, address, alias: `dev-${index}` };
    };
  } catch (err) {
    console.warn("[serverWallet] SponsoredFPC / account-creation setup failed:", err);
  }

  return { baseWallet, accounts, createGenerated };
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
 * Returns all registered accounts (for use in /api/accounts), including any
 * runtime-generated ones — the server is the source of truth for those.
 */
export async function getTestAccountAddresses(): Promise<
  Array<{ index: number; address: string; isAdmin: boolean; isGenerated: boolean; alias: string }>
> {
  const { accounts } = await getServerWallet();
  return accounts.map((a) => ({
    index: a.index,
    address: a.address,
    isAdmin: a.index === 0,
    isGenerated: Boolean(a.isGenerated),
    alias: a.isGenerated ? `dev-${a.index}` : a.index === 0 ? "test0 (admin)" : `test${a.index}`,
  }));
}

/**
 * Create + deploy a real, fee-sponsored account at runtime and return it.
 * The account is registered in the shared PXE and added to the accounts list,
 * so it can immediately verify KYC, deposit, vote, and trade like a test account.
 */
export async function createGeneratedAccount(): Promise<GeneratedAccountResult> {
  const { createGenerated } = await getServerWallet();
  return createGenerated();
}
