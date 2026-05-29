/**
 * Fair Squares -- Testnet contract deploy
 *
 * Deploys the 6 Fair Squares Noir contracts plus the vendored aztec-standards
 * instances they need: FSFT, EUR, and ProtocolToken are each a distinct AIP-20
 * `Token` (one canonical EUR -- no FundToken clones), a Dripper faucet (EUR's
 * minter), and a PropertyNFT (AIP-721 deed). Pays fees via SponsoredFPC. Each
 * token's minter is IMMUTABLE and set at deploy (FSFT->housing_fund,
 * EUR->dripper, ProtocolToken->protocol_rewards), so deploy ORDER matters and
 * there are no set_admin handoffs. Wires set_contracts / set_property_nft /
 * set_protocol_token and issues a private KYC credential to the deployer so an
 * immediate V2 deposit smoke flow is possible.
 *
 * Prereqs:
 *   1. `npx tsx scripts/testnet-deploy-account.ts` first -- that
 *      creates scripts/.testnet/account.json with a funded Schnorr
 *      account; this script reuses it.
 *   2. Contract artifacts must be present under contracts/<c>/target/
 *      (run via the host CLI: `aztec compile` per contract, or just
 *      run `./scripts/aztec-test.sh` once -- it leaves artifacts
 *      behind).
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-contracts.ts
 *
 * Output:
 *   - scripts/.testnet/contracts.json  { all 9 addresses }
 *   - frontend/.env.testnet            NEXT_PUBLIC_* keys ready to
 *                                      pick up with AZTEC_NETWORK=testnet.
 *
 * Notes:
 *   - This script is idempotent on the writes (env files are
 *     overwritten), but contract deploys themselves are NOT
 *     idempotent on testnet: re-running will deploy fresh
 *     instances. If contracts.json already exists, the script
 *     refuses unless FS_TESTNET_FORCE_REDEPLOY=1 is set.
 *   - Run time on testnet: ~5-15 min depending on prover queue.
 */

import * as fs from "fs";
import * as path from "path";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract, ContractDeployer, getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { loadContractArtifact } from "@aztec/aztec.js/abi";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/foundation/curves/bn254";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";

const DEFAULT_TESTNET_PXE = "https://rpc.testnet.aztec-labs.com";
const ROOT = path.resolve(__dirname, "..");

function log(msg: string) {
  console.log(`[testnet-deploy-contracts] ${msg}`);
}

function accountFilePath(): string {
  if (process.env.FS_TESTNET_ACCOUNT) return process.env.FS_TESTNET_ACCOUNT;
  return path.resolve(__dirname, ".testnet", "account.json");
}

function contractsFilePath(): string {
  return path.resolve(__dirname, ".testnet", "contracts.json");
}

function loadAccount() {
  const p = accountFilePath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `Account file ${p} not found. Run scripts/testnet-deploy-account.ts first.`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as {
    secret: string;
    salt: string;
    address: string;
  };
}

function loadArtifact(crate: string, name: string) {
  const p = path.resolve(ROOT, "contracts", crate, "target", `${crate}-${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Artifact missing: ${p}. Compile with: cd contracts/${crate} && aztec compile`,
    );
  }
  return loadContractArtifact(
    JSON.parse(fs.readFileSync(p, "utf8")) as Parameters<typeof loadContractArtifact>[0],
  );
}

// Vendored aztec-standards artifacts live in a separate Nargo workspace target.
function loadStandardArtifact(crate: string, name: string) {
  const p = path.resolve(
    ROOT,
    "contracts",
    "vendor",
    "aztec-standards",
    "target",
    `${crate}-${name}.json`,
  );
  if (!fs.existsSync(p)) {
    throw new Error(
      `Standard artifact missing: ${p}. Compile the vendored workspace: ` +
        `cd contracts/vendor/aztec-standards && aztec compile`,
    );
  }
  return loadContractArtifact(
    JSON.parse(fs.readFileSync(p, "utf8")) as Parameters<typeof loadContractArtifact>[0],
  );
}

async function main() {
  const network = (process.env.AZTEC_NETWORK ?? "").toLowerCase();
  if (network !== "testnet") {
    throw new Error(
      `AZTEC_NETWORK must be "testnet" (got "${network}").`,
    );
  }

  if (fs.existsSync(contractsFilePath()) && !process.env.FS_TESTNET_FORCE_REDEPLOY) {
    throw new Error(
      `${contractsFilePath()} already exists. Set FS_TESTNET_FORCE_REDEPLOY=1 to overwrite (deploys fresh instances).`,
    );
  }

  const pxeUrl =
    process.env.AZTEC_NODE_URL ??
    process.env.PXE_URL ??
    DEFAULT_TESTNET_PXE;

  log(`network = ${network}`);
  log(`pxe     = ${pxeUrl}`);

  const persisted = loadAccount();
  const node = createAztecNodeClient(pxeUrl);
  const wallet = await EmbeddedWallet.create(node);
  const accountManager = await wallet.createSchnorrAccount(
    Fr.fromString(persisted.secret),
    Fr.fromString(persisted.salt),
  );
  const deployer = accountManager.address;
  log(`deployer = ${deployer.toString()}`);

  // Sponsored FPC fee method (canonical salt=0 deployment on testnet).
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  await wallet.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  const paymentMethod = new SponsoredFeePaymentMethod(fpcInstance.address);
  log(`fpc      = ${fpcInstance.address.toString()}`);

  // -- Load all contract artifacts upfront ----------------------------------
  // FSFT, EUR, and ProtocolToken all share the vendored AIP-20 Token artifact
  // (`vtoken`); they are distinct instances with distinct immutable minters.
  const artifacts = {
    kyc: loadArtifact("kyc_verifier", "KYCVerifier"),
    vault: loadArtifact("defi_vault", "DeFiVault"),
    fund: loadArtifact("housing_fund", "HousingFund"),
    gov: loadArtifact("governance", "Governance"),
    dex: loadArtifact("fsft_dex", "FSFTDex"),
    rewards: loadArtifact("protocol_rewards", "ProtocolRewards"),
    vtoken: loadStandardArtifact("token_contract", "Token"),
    dripper: loadStandardArtifact("dripper", "Dripper"),
    nft: loadStandardArtifact("nft_contract", "NFT"),
  };

  type ArtifactKey = keyof typeof artifacts;

  async function deploy(
    label: string,
    artKey: ArtifactKey,
    args: unknown[],
    constructorName?: string,
  ): Promise<AztecAddress> {
    log(`deploying ${label}...`);
    const ctorDeployer = new ContractDeployer(artifacts[artKey], wallet, constructorName);
    const sent = await ctorDeployer
      .deploy(args)
      .send({ from: deployer, fee: { paymentMethod } } as never);
    const receipt = await (sent as {
      wait: () => Promise<{ contract: { address: AztecAddress } }>;
    }).wait();
    const addr = receipt.contract.address;
    log(`  ${label} -> ${addr.toString()}`);
    return addr;
  }

  async function sendAtomic(
    label: string,
    contractArtifact: ArtifactKey,
    contractAddr: AztecAddress,
    fn: string,
    args: unknown[],
  ): Promise<void> {
    log(`wiring ${label}...`);
    const c = await Contract.at(contractAddr, artifacts[contractArtifact], wallet);
    const sent = await (c.methods as Record<string, (...a: unknown[]) => { send: (o: unknown) => Promise<unknown> }>)[fn](...args)
      .send({ from: deployer, fee: { paymentMethod } });
    await (sent as { wait: () => Promise<unknown> }).wait();
    log(`  ${label} ok`);
  }

  // -- Deploy contracts in dependency order (immutable-minter constrained) ---
  const kycAddr = await deploy("KYCVerifier", "kyc", [deployer]);
  const vaultAddr = await deploy("DeFiVault", "vault", [deployer, 300]);
  // HousingFund before FSFT: it is FSFT's immutable minter.
  const fundAddr = await deploy("HousingFund", "fund", [deployer]);
  const tokenAddr = await deploy(
    "FSFT (AIP-20)",
    "vtoken",
    ["Fair Squares FSFT", "FSFT", 0, fundAddr],
    "constructor_with_minter",
  );

  const govVotingWindow = Number(process.env.GOVERNANCE_VOTING_WINDOW_BLOCKS ?? "300");
  const govMinQuorum = Number(process.env.GOVERNANCE_MIN_QUORUM_VOTES ?? "2");
  const govAddr = await deploy("Governance", "gov", [
    fundAddr,
    kycAddr,
    tokenAddr,
    govVotingWindow,
    govMinQuorum,
  ]);

  // Dripper before EUR: it is EUR's immutable minter. ONE canonical EUR (AIP-20).
  const dripperAddr = await deploy("Dripper", "dripper", []);
  const eurAddr = await deploy(
    "EUR (AIP-20)",
    "vtoken",
    ["EURs", "EUR", 0, dripperAddr],
    "constructor_with_minter",
  );

  // PropertyNFT (AIP-721); the housing fund is its minter.
  const propertyNftAddr = await deploy(
    "PropertyNFT (AIP-721)",
    "nft",
    ["Fair Squares Property", "FSP-RE", fundAddr],
    "constructor_with_minter",
  );

  const dexBandBps = Number(process.env.DEX_PRICE_BAND_BPS ?? "200");
  const dexMaxTtl = Number(process.env.DEX_MAX_TTL_BLOCKS ?? "120");
  const dexAddr = await deploy("FSFTDex", "dex", [
    deployer,
    kycAddr,
    fundAddr,
    tokenAddr,
    eurAddr,
    dexBandBps,
    dexMaxTtl,
  ]);

  // ProtocolRewards before ProtocolToken: it is ProtocolToken's immutable minter.
  // New constructor: (admin, fsft_token, housing_fund, governance, kyc, claim_min).
  const rewardsClaimMin = Number(process.env.PROTOCOL_REWARDS_CLAIM_MIN ?? "1");
  const rewardsAddr = await deploy("ProtocolRewards", "rewards", [
    deployer,
    tokenAddr,
    fundAddr,
    govAddr,
    kycAddr,
    rewardsClaimMin,
  ]);
  const protocolTokenAddr = await deploy(
    "ProtocolToken (AIP-20)",
    "vtoken",
    ["Fair Squares Protocol", "FSP", 0, rewardsAddr],
    "constructor_with_minter",
  );

  // -- Wire links -----------------------------------------------------------
  await sendAtomic("HousingFund.set_contracts", "fund", fundAddr, "set_contracts", [
    kycAddr,
    tokenAddr,
    vaultAddr,
    govAddr,
  ]);
  await sendAtomic("HousingFund.set_property_nft", "fund", fundAddr, "set_property_nft", [
    propertyNftAddr,
  ]);
  await sendAtomic("DeFiVault.set_housing_fund", "vault", vaultAddr, "set_housing_fund", [
    fundAddr,
  ]);
  // No set_admin handoffs: token minters are immutable (set at deploy). Only the
  // rewards->protocol_token link is wired post-deploy (deferred for the cycle).
  await sendAtomic("ProtocolRewards.set_protocol_token", "rewards", rewardsAddr, "set_protocol_token", [
    protocolTokenAddr,
  ]);

  // -- Issue a private KYC credential to the deployer -----------------------
  await sendAtomic("KYCVerifier.register_kyc(deployer)", "kyc", kycAddr, "register_kyc", [
    deployer,
  ]);
  await sendAtomic("KYCVerifier.issue_credential(deployer)", "kyc", kycAddr, "issue_credential", [
    deployer,
    1,
  ]);

  // -- Persist outputs ------------------------------------------------------
  const out = {
    network: "testnet",
    pxe: pxeUrl,
    deployer: deployer.toString(),
    contracts: {
      kyc_verifier: kycAddr.toString(),
      fund_token: tokenAddr.toString(),
      defi_vault: vaultAddr.toString(),
      housing_fund: fundAddr.toString(),
      governance: govAddr.toString(),
      eur_token: eurAddr.toString(),
      dripper: dripperAddr.toString(),
      property_nft: propertyNftAddr.toString(),
      fsft_dex: dexAddr.toString(),
      protocol_token: protocolTokenAddr.toString(),
      protocol_rewards: rewardsAddr.toString(),
    },
    params: {
      governance_voting_window_blocks: govVotingWindow,
      governance_min_quorum_votes: govMinQuorum,
      dex_price_band_bps: dexBandBps,
      dex_max_ttl_blocks: dexMaxTtl,
      protocol_rewards_claim_min: rewardsClaimMin,
    },
  };
  fs.mkdirSync(path.dirname(contractsFilePath()), { recursive: true });
  fs.writeFileSync(contractsFilePath(), JSON.stringify(out, null, 2));
  log(`wrote ${contractsFilePath()}`);

  const envContent = `# Auto-generated by scripts/testnet-deploy-contracts.ts
# ${new Date().toISOString()}

AZTEC_NETWORK=testnet
NEXT_PUBLIC_AZTEC_NETWORK=testnet
NEXT_PUBLIC_AZTEC_PXE_URL=${pxeUrl}
NEXT_PUBLIC_DEV_MODE=false
NEXT_PUBLIC_SIMULATION=false
AZTEC_LIVE=true

GOVERNANCE_VOTING_WINDOW_BLOCKS=${govVotingWindow}
GOVERNANCE_MIN_QUORUM_VOTES=${govMinQuorum}
DEX_PRICE_BAND_BPS=${dexBandBps}
DEX_MAX_TTL_BLOCKS=${dexMaxTtl}
PROTOCOL_REWARDS_CLAIM_MIN=${rewardsClaimMin}

NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=${out.contracts.kyc_verifier}
NEXT_PUBLIC_FUND_TOKEN_ADDRESS=${out.contracts.fund_token}
NEXT_PUBLIC_DEFI_VAULT_ADDRESS=${out.contracts.defi_vault}
NEXT_PUBLIC_HOUSING_FUND_ADDRESS=${out.contracts.housing_fund}
NEXT_PUBLIC_GOVERNANCE_ADDRESS=${out.contracts.governance}
NEXT_PUBLIC_FSFT_DEX_ADDRESS=${out.contracts.fsft_dex}
NEXT_PUBLIC_EUR_TOKEN_ADDRESS=${out.contracts.eur_token}
NEXT_PUBLIC_DRIPPER_ADDRESS=${out.contracts.dripper}
NEXT_PUBLIC_PROPERTY_NFT_ADDRESS=${out.contracts.property_nft}
NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS=${out.contracts.protocol_token}
NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS=${out.contracts.protocol_rewards}

NEXT_PUBLIC_ADMIN_ADDRESS=${out.deployer}
`;
  const envPath = path.resolve(ROOT, "frontend", ".env.testnet");
  fs.writeFileSync(envPath, envContent);
  log(`wrote ${envPath}`);

  log("");
  log("============================================");
  log("Testnet deploy complete.");
  log(`  KYCVerifier      ${out.contracts.kyc_verifier}`);
  log(`  FSFT (AIP-20)    ${out.contracts.fund_token} (minter: housing_fund)`);
  log(`  EUR  (AIP-20)    ${out.contracts.eur_token} (minter: dripper)`);
  log(`  Dripper          ${out.contracts.dripper}`);
  log(`  PropertyNFT      ${out.contracts.property_nft} (minter: housing_fund)`);
  log(`  ProtocolToken    ${out.contracts.protocol_token} (minter: protocol_rewards)`);
  log(`  DeFiVault        ${out.contracts.defi_vault}`);
  log(`  HousingFund      ${out.contracts.housing_fund}`);
  log(`  Governance       ${out.contracts.governance}`);
  log(`  FSFTDex          ${out.contracts.fsft_dex}`);
  log(`  ProtocolRewards  ${out.contracts.protocol_rewards}`);
  log("============================================");
}

main().catch((err) => {
  console.error(
    "[testnet-deploy-contracts] FAILED:",
    err instanceof Error ? err.stack ?? err.message : String(err),
  );
  process.exit(1);
});
