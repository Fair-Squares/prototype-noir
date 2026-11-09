/**
 * Fair Squares -- Testnet contract deploy (aztec v6)
 *
 * Deploys the 6 Fair Squares Noir contracts plus the vendored aztec-standards
 * instances they need: FSFT, EUR, and ProtocolToken are each a distinct AIP-20
 * `Token` (one canonical EUR), a Dripper faucet (EUR's minter), and a
 * PropertyNFT (AIP-721 deed). Pays every fee via the canonical SponsoredFPC.
 * Each token's minter is IMMUTABLE and set at deploy (FSFT->housing_fund,
 * EUR->dripper, ProtocolToken->protocol_rewards), so deploy ORDER matters.
 *
 * Wiring is the SAME set the local bootstrap performs (scripts/
 * bootstrap-local-network.sh): set_contracts / set_property_nft /
 * set_eur_token / DeFiVault.set_housing_fund / set_protocol_token, plus a
 * public register_kyc + private issue_credential for the deployer so an
 * immediate private deposit smoke flow is possible.
 *
 * Prereqs:
 *   1. `AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-account.ts` --
 *      creates scripts/.testnet/account.json; this script reuses it.
 *   2. Artifacts compiled with the pinned host toolchain:
 *      `./scripts/compile-contracts.sh` (aztec 6.0.0).
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-contracts.ts
 *
 * Output:
 *   - scripts/.testnet/contracts.json  { all 11 addresses + params }
 *   - frontend/.env.testnet            NEXT_PUBLIC_* keys
 *
 * Deploys are NOT idempotent on testnet: re-running deploys fresh instances, so
 * the script refuses if contracts.json exists unless FS_TESTNET_FORCE_REDEPLOY=1.
 * Every send is checked for a post-mining public revert (no silent success).
 */

import * as fs from "fs";
import * as path from "path";
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { Fr, GrumpkinScalar } from "@aztec-labs/aztec.js/fields";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import {
  assertNodeVersion,
  loadPersistedAccount,
  requireTestnet,
  sponsoredFeeMethod,
  testnetNodeClient,
  txIsMined,
} from "./testnet-deploy-account";

const ROOT = path.resolve(__dirname, "..");
/** Testnet inclusion + proving can take minutes; never wait less than this. */
const WAIT_TIMEOUT_SECONDS = Number(process.env.FS_TESTNET_TX_TIMEOUT ?? "900");

function log(msg: string) {
  console.log(`[testnet-deploy-contracts] ${msg}`);
}

function contractsFilePath(): string {
  return path.resolve(__dirname, ".testnet", "contracts.json");
}

function readArtifact(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Artifact missing: ${p}. Compile with ./scripts/compile-contracts.sh (host aztec 6.0.0).`);
  }
  return loadContractArtifact(JSON.parse(fs.readFileSync(p, "utf8")) as Parameters<typeof loadContractArtifact>[0]);
}

function loadArtifact(crate: string, name: string) {
  return readArtifact(path.resolve(ROOT, "contracts", crate, "target", `${crate}-${name}.json`));
}

// Vendored aztec-standards artifacts live in a separate Nargo workspace target.
function loadStandardArtifact(crate: string, name: string) {
  return readArtifact(path.resolve(ROOT, "contracts", "vendor", "aztec-standards", "target", `${crate}-${name}.json`));
}

/** A mined receipt resolves even when the public tail reverted; surface that. */
function assertNotReverted(label: string, result: unknown): void {
  const top = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const inner = (top.receipt as Record<string, unknown> | undefined) ?? top;
  const execResult = inner.executionResult;
  const reverted =
    (typeof execResult === "string" && execResult.toLowerCase() === "reverted") ||
    (typeof (inner as { hasExecutionReverted?: () => boolean }).hasExecutionReverted === "function" &&
      (inner as { hasExecutionReverted: () => boolean }).hasExecutionReverted());
  if (reverted) {
    throw new Error(`${label} was mined but REVERTED: ${String(inner.error ?? "unknown")}`);
  }
}

async function main() {
  const nodeUrl = requireTestnet();
  if (fs.existsSync(contractsFilePath()) && !process.env.FS_TESTNET_FORCE_REDEPLOY) {
    throw new Error(
      `${contractsFilePath()} already exists. Set FS_TESTNET_FORCE_REDEPLOY=1 to overwrite (deploys fresh instances).`,
    );
  }
  log(`network = testnet`);
  log(`node    = ${nodeUrl}`);

  const persisted = loadPersistedAccount();
  if (!persisted) throw new Error("No scripts/.testnet/account.json -- run testnet-deploy-account.ts first.");

  const node = testnetNodeClient(nodeUrl);
  await assertNodeVersion(node);
  const wallet = await EmbeddedWallet.create(node, { pxe: { proverEnabled: true } });
  const paymentMethod = await sponsoredFeeMethod(wallet);

  const manager = await wallet.createSchnorrAccount(
    Fr.fromString(persisted.secret),
    Fr.fromString(persisted.salt),
    GrumpkinScalar.fromString(persisted.signingKey),
  );
  const deployer = manager.address;
  // Account contracts are not publicly deployed (node.getContract stays null),
  // so the proof of deployment is the persisted, mined deploy tx.
  if (!persisted.deployTxHash || !(await txIsMined(node, persisted.deployTxHash))) {
    throw new Error(`Deployer ${deployer.toString()} has no mined deploy tx on record. Run testnet-deploy-account.ts first.`);
  }
  log(`deployer = ${deployer.toString()} (deploy tx ${persisted.deployTxHash})`);

  // -- Load all contract artifacts upfront ----------------------------------
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

  const sendOpts = { from: deployer, fee: { paymentMethod }, wait: { timeout: WAIT_TIMEOUT_SECONDS } };

  async function deploy(label: string, artKey: ArtifactKey, args: unknown[], constructorName?: string) {
    log(`deploying ${label}...`);
    // v6: Contract.deploy(wallet, artifact, args, constructorName?, instantiation?);
    // deployer = `from` (locked at first send), random salt. send() awaits inclusion
    // and resolves { contract, instance, receipt }.
    const result = await Contract.deploy(wallet, artifacts[artKey], args, constructorName).send(sendOpts);
    assertNotReverted(`deploy ${label}`, result);
    const addr: AztecAddress = result.instance.address;
    log(`  ${label} -> ${addr.toString()}`);
    return addr;
  }

  async function send(label: string, artKey: ArtifactKey, at: AztecAddress, fn: string, args: unknown[]) {
    log(`wiring ${label}...`);
    const c = Contract.at(at, artifacts[artKey], wallet);
    const methods = c.methods as Record<string, (...a: unknown[]) => { send: (o: typeof sendOpts) => Promise<unknown> }>;
    const result = await methods[fn](...args).send(sendOpts);
    assertNotReverted(label, result);
    log(`  ${label} ok`);
  }

  // -- Deploy in dependency order (immutable-minter constrained) -----------
  const kycAddr = await deploy("KYCVerifier", "kyc", [deployer]);
  const vaultAddr = await deploy("DeFiVault", "vault", [deployer, 300]);
  const fundAddr = await deploy("HousingFund", "fund", [deployer]); // FSFT's immutable minter
  const tokenAddr = await deploy("FSFT (AIP-20)", "vtoken", ["Fair Squares FSFT", "FSFT", 0, fundAddr], "constructor_with_minter");

  const govVotingWindow = Number(process.env.GOVERNANCE_VOTING_WINDOW_BLOCKS ?? "300");
  const govMinQuorum = Number(process.env.GOVERNANCE_MIN_QUORUM_VOTES ?? "2");
  const govAddr = await deploy("Governance", "gov", [fundAddr, kycAddr, tokenAddr, govVotingWindow, govMinQuorum]);

  const dripperAddr = await deploy("Dripper", "dripper", []); // EUR's immutable minter
  const eurAddr = await deploy("EUR (AIP-20)", "vtoken", ["EURs", "EUR", 0, dripperAddr], "constructor_with_minter");
  const propertyNftAddr = await deploy("PropertyNFT (AIP-721)", "nft", ["Fair Squares Property", "FSP-RE", fundAddr], "constructor_with_minter");

  const dexBandBps = Number(process.env.DEX_PRICE_BAND_BPS ?? "200");
  const dexMaxTtl = Number(process.env.DEX_MAX_TTL_BLOCKS ?? "120");
  const dexAddr = await deploy("FSFTDex", "dex", [deployer, kycAddr, fundAddr, tokenAddr, eurAddr, dexBandBps, dexMaxTtl]);

  const rewardsClaimMin = Number(process.env.PROTOCOL_REWARDS_CLAIM_MIN ?? "1");
  const rewardsAddr = await deploy("ProtocolRewards", "rewards", [deployer, tokenAddr, fundAddr, govAddr, kycAddr, rewardsClaimMin]);
  const protocolTokenAddr = await deploy("ProtocolToken (AIP-20)", "vtoken", ["Fair Squares Protocol", "FSP", 0, rewardsAddr], "constructor_with_minter");

  // -- Wire links (mirrors bootstrap-local-network.sh wire_contracts) --------
  await send("HousingFund.set_contracts", "fund", fundAddr, "set_contracts", [kycAddr, tokenAddr, vaultAddr, govAddr]);
  await send("HousingFund.set_property_nft", "fund", fundAddr, "set_property_nft", [propertyNftAddr]);
  // REQUIRED for any rent claim/reinvest: without it eur_token stays zero and
  // claim_rent_private / reinvest_rent_private revert "eur token mismatch".
  await send("HousingFund.set_eur_token", "fund", fundAddr, "set_eur_token", [eurAddr]);
  await send("DeFiVault.set_housing_fund", "vault", vaultAddr, "set_housing_fund", [fundAddr]);
  await send("ProtocolRewards.set_protocol_token", "rewards", rewardsAddr, "set_protocol_token", [protocolTokenAddr]);

  // -- KYC the deployer (public role + private credential note) -------------
  await send("KYCVerifier.register_kyc(deployer)", "kyc", kycAddr, "register_kyc", [deployer]);
  await send("KYCVerifier.issue_credential(deployer)", "kyc", kycAddr, "issue_credential", [deployer, 1]);

  // -- Persist outputs ------------------------------------------------------
  const out = {
    network: "testnet",
    node: nodeUrl,
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
NEXT_PUBLIC_AZTEC_PXE_URL=${nodeUrl}
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
  for (const [k, v] of Object.entries(out.contracts)) log(`  ${k.padEnd(17)} ${v}`);
  log("============================================");
  log("Explorer: https://testnet.aztecscan.xyz (search any address above)");
}

main().catch((err) => {
  console.error("[testnet-deploy-contracts] FAILED:", err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
