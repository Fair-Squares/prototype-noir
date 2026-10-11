/**
 * Fair Squares -- Local-network deploy + wiring + demo seed, in ONE SDK process.
 *
 * Replaces the ~26 separate `aztec-wallet` invocations the bootstrap used to
 * make (each one booted a fresh node process and PXE). One EmbeddedWallet
 * holding the three local-network test accounts deploys the 11 contract
 * instances, wires the links, registers + credentials KYC for test0/1/2, mints
 * EUR via the Dripper, moves test0's 500 000 EUR into the fund and records it
 * as a private DepositNote -- the same steps, same arguments, same order as
 * before (see `deploy order` below: token minters are immutable, so order
 * matters).
 *
 * Runs on plain Node >= 22.6 (type stripping; no tsx, no build step) so the
 * bootstrap container can execute it with the Aztec image's own
 * `@aztec-labs/*` packages -- exactly the node's version, no npm install.
 * The file therefore uses only erasable TypeScript (no enums, no
 * `import x = require`, `import type` for types) and no `__dirname`.
 *
 * Usage (inside the bootstrap container, via bootstrap-local-network.sh):
 *   FS_ROOT=/workspace FS_DEPLOY_OUT=/tmp/out.json AZTEC_NODE_URL=http://aztec:8080 \
 *     node --no-warnings local-deploy.ts
 * Standalone against a host local network (artifacts already compiled):
 *   AZTEC_NODE_URL=http://localhost:8080 node --no-warnings scripts/local-deploy.ts
 *
 * Env:
 *   AZTEC_NODE_URL / PXE_URL        node URL (default http://localhost:8080)
 *   FS_ROOT                         repo root (default: cwd or its parent, whichever holds contracts/)
 *   FS_DEPLOY_OUT                   write the JSON result here (else stdout)
 *   PXE_PROVER_ENABLED              "true" to generate client proofs (default false: local network)
 *   WALLET_MIN_FEE_PADDING          maxFeesPerGas = minFees * (1 + padding) (default 30, see serverWallet.ts)
 *   WALLET_WAIT_INTERVAL_SECONDS    receipt poll cadence (default 0.25)
 *   BOOTSTRAP_WAIT_FOR_STATUS       "checkpointed" (default) or "proposed" -- every tx is awaited
 *                                   to this status before the next dependent one is sent
 *   GOVERNANCE_VOTING_WINDOW_BLOCKS, GOVERNANCE_MIN_QUORUM_VOTES, DEX_PRICE_BAND_BPS,
 *   DEX_MAX_TTL_BLOCKS, PROTOCOL_REWARDS_CLAIM_MIN   constructor params (same defaults as the bootstrap)
 *   SEED_AMOUNT                     test0's initial fund deposit (default 500000)
 *
 * Output JSON: { node, accounts: {test0,test1,test2}, contracts: {...}, params: {...} }.
 * All progress logging goes to stderr so stdout stays machine-readable.
 */

import * as fs from "fs";
import * as path from "path";
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";
import type { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { ContractDeployer } from "@aztec-labs/aztec.js/deployment";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { TxStatus } from "@aztec-labs/aztec.js/tx";
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

const T0 = Date.now();
function log(msg: string) {
  const t = ((Date.now() - T0) / 1000).toFixed(1).padStart(6);
  process.stderr.write(`[local-deploy ${t}s] ${msg}\n`);
}

function envNum(name: string, dflt: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function resolveRoot(): string {
  if (process.env.FS_ROOT) return path.resolve(process.env.FS_ROOT);
  for (const candidate of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(candidate, "contracts", "kyc_verifier"))) return candidate;
  }
  throw new Error("Cannot locate the repo root (no contracts/kyc_verifier under cwd or its parent); set FS_ROOT");
}

type Artifact = ReturnType<typeof loadContractArtifact>;

/** v6 simulate() resolves to `{ result, offchainEffects, offchainMessages }`;
 *  return the decoded return value (same unwrap as scripts/e2e/harness.ts). */
function simValue<T>(sim: unknown): T {
  if (sim && typeof sim === "object" && "result" in (sim as Record<string, unknown>)) {
    return (sim as { result: T }).result;
  }
  return sim as T;
}

function loadArtifactFile(p: string): Artifact {
  if (!fs.existsSync(p)) {
    throw new Error(`Artifact missing: ${p} (compile first: aztec compile in the contract dir)`);
  }
  const json = JSON.parse(fs.readFileSync(p, "utf8")) as { transpiled?: boolean };
  if (json.transpiled !== true) {
    throw new Error(`Artifact ${p} is not transpiled (raw nargo output); run aztec compile`);
  }
  return loadContractArtifact(json as Parameters<typeof loadContractArtifact>[0]);
}

async function main() {
  const root = resolveRoot();
  const nodeUrl = process.env.AZTEC_NODE_URL ?? process.env.PXE_URL ?? "http://localhost:8080";
  const waitStatusRaw = (process.env.BOOTSTRAP_WAIT_FOR_STATUS ?? "checkpointed").toLowerCase();
  if (waitStatusRaw !== "checkpointed" && waitStatusRaw !== "proposed") {
    throw new Error(`BOOTSTRAP_WAIT_FOR_STATUS must be "checkpointed" or "proposed", got "${waitStatusRaw}"`);
  }
  const waitForStatus = waitStatusRaw === "proposed" ? TxStatus.PROPOSED : TxStatus.CHECKPOINTED;
  const proverEnabled = process.env.PXE_PROVER_ENABLED === "true";
  const feePadding = envNum("WALLET_MIN_FEE_PADDING", 30);
  const waitInterval = envNum("WALLET_WAIT_INTERVAL_SECONDS", 0.25);

  const params = {
    governance_voting_window_blocks: envNum("GOVERNANCE_VOTING_WINDOW_BLOCKS", 300),
    governance_min_quorum_votes: envNum("GOVERNANCE_MIN_QUORUM_VOTES", 2),
    dex_price_band_bps: envNum("DEX_PRICE_BAND_BPS", 200),
    dex_max_ttl_blocks: envNum("DEX_MAX_TTL_BLOCKS", 120),
    protocol_rewards_claim_min: envNum("PROTOCOL_REWARDS_CLAIM_MIN", 1),
  };
  const seedAmount = BigInt(process.env.SEED_AMOUNT ?? "500000");

  log(`root = ${root}`);
  log(`node = ${nodeUrl}  wait=${waitStatusRaw}  prover=${proverEnabled}  feePadding=${feePadding}`);

  // -- Artifacts (all loaded up front so a missing one fails before any tx) --
  const custom = (crate: string, name: string) =>
    loadArtifactFile(path.join(root, "contracts", crate, "target", `${crate}-${name}.json`));
  const standard = (crate: string, name: string) =>
    loadArtifactFile(path.join(root, "contracts", "vendor", "aztec-standards", "target", `${crate}-${name}.json`));
  const artifacts = {
    kyc: custom("kyc_verifier", "KYCVerifier"),
    vault: custom("defi_vault", "DeFiVault"),
    fund: custom("housing_fund", "HousingFund"),
    gov: custom("governance", "Governance"),
    dex: custom("fsft_dex", "FSFTDex"),
    rewards: custom("protocol_rewards", "ProtocolRewards"),
    token: standard("token_contract", "Token"),
    dripper: standard("dripper", "Dripper"),
    nft: standard("nft_contract", "NFT"),
  };
  type ArtifactKey = keyof typeof artifacts;
  log("artifacts loaded");

  // -- Wallet: one in-process PXE holding the three local-network test accounts
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxe: { proverEnabled },
  });
  wallet.setMinFeePadding(feePadding);
  // BaseWallet keeps the poll interval protected (only the upstream TestWallet
  // exposes a setter); same cast as serverWallet.ts.
  (wallet as unknown as { defaultWaitInterval?: number }).defaultWaitInterval = waitInterval;

  const testAccounts = await getInitialTestAccountsData();
  if (testAccounts.length < 3) {
    throw new Error(`Expected 3 local-network test accounts, got ${testAccounts.length}`);
  }
  // v6 local-network test accounts are INITIALIZERLESS Schnorr accounts (funded
  // at genesis, no deployment tx). createSchnorrAccount would derive a
  // different, unfunded address and every send would fail with "Not enough
  // balance for fee payer".
  const accounts: AztecAddress[] = [];
  for (const [i, a] of testAccounts.slice(0, 3).entries()) {
    const manager = await wallet.createSchnorrInitializerlessAccount(a.secret, a.salt, a.signingKey);
    accounts.push(manager.address);
    log(`test${i} = ${manager.address.toString()}`);
  }
  const [admin, test1, test2] = accounts;
  const wait = { waitForStatus };

  // -- Helpers ----------------------------------------------------------------
  async function deploy(
    label: string,
    key: ArtifactKey,
    args: unknown[],
    constructorName?: string,
  ): Promise<AztecAddress> {
    const t = Date.now();
    const { contract } = await new ContractDeployer(artifacts[key], wallet, constructorName)
      .deploy(args)
      .send({ from: admin, wait });
    log(`deployed ${label} -> ${contract.address.toString()} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    return contract.address;
  }

  type Methods = Record<string, (...a: unknown[]) => { send: (o: unknown) => Promise<unknown> }>;
  async function send(
    label: string,
    key: ArtifactKey,
    at: AztecAddress,
    from: AztecAddress,
    fn: string,
    args: unknown[],
  ): Promise<void> {
    const t = Date.now();
    const c = await Contract.at(at, artifacts[key], wallet);
    // waitForTx throws on a reverted tx, so a failed step aborts the deploy
    // rather than being reported as success.
    await (c.methods as unknown as Methods)[fn](...args).send({ from, wait });
    log(`${label} ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }

  // -- Deploy order (immutable-minter constrained) -----------------------------
  const kyc = await deploy("KYCVerifier", "kyc", [admin]);
  const vault = await deploy("DeFiVault", "vault", [admin, 300]);
  // HousingFund before FSFT: it is FSFT's immutable minter.
  const fund = await deploy("HousingFund", "fund", [admin]);
  const token = await deploy("FSFT (AIP-20)", "token", ["Fair Squares FSFT", "FSFT", 0, fund], "constructor_with_minter");
  const gov = await deploy("Governance", "gov", [
    fund,
    kyc,
    token,
    params.governance_voting_window_blocks,
    params.governance_min_quorum_votes,
  ]);
  // Dripper before EUR: it is EUR's immutable minter (the only way to mint EUR).
  const dripper = await deploy("Dripper", "dripper", []);
  const eur = await deploy("EUR (AIP-20)", "token", ["EURs", "EUR", 0, dripper], "constructor_with_minter");
  // PropertyNFT (AIP-721 deed); the housing fund mints a deed per executed proposal.
  const propertyNft = await deploy("PropertyNFT (AIP-721)", "nft", ["Fair Squares Property", "FSP-RE", fund], "constructor_with_minter");
  const dex = await deploy("FSFTDex", "dex", [
    admin,
    kyc,
    fund,
    token,
    eur,
    params.dex_price_band_bps,
    params.dex_max_ttl_blocks,
  ]);
  // ProtocolRewards before ProtocolToken: it is the token's immutable minter.
  const rewards = await deploy("ProtocolRewards", "rewards", [
    admin,
    token,
    fund,
    gov,
    kyc,
    params.protocol_rewards_claim_min,
  ]);
  const protocolToken = await deploy("ProtocolToken (AIP-20)", "token", ["Fair Squares Protocol", "FSP", 0, rewards], "constructor_with_minter");

  // -- Wiring -----------------------------------------------------------------
  await send("HousingFund.set_contracts", "fund", fund, admin, "set_contracts", [kyc, token, vault, gov]);
  await send("HousingFund.set_property_nft", "fund", fund, admin, "set_property_nft", [propertyNft]);
  // Required before any rent claim: without it HousingFund.eur_token stays zero
  // and claim_rent_private / reinvest_rent_private revert "eur token mismatch".
  await send("HousingFund.set_eur_token", "fund", fund, admin, "set_eur_token", [eur]);
  await send("DeFiVault.set_housing_fund", "vault", vault, admin, "set_housing_fund", [fund]);
  // Token minters are immutable (set at deploy); only the rewards -> protocol
  // token link is wired afterwards, because the token needs the rewards
  // contract (its minter) to exist first.
  await send("ProtocolRewards.set_protocol_token", "rewards", rewards, admin, "set_protocol_token", [protocolToken]);

  // -- KYC: public investor role + private credential note per test account ----
  // Nonces 1/2/3 are deterministic per account so revocation tooling can
  // recompute commitments via KYCVerifier.compute_revocation_commitment.
  for (const [i, who] of accounts.entries()) {
    await send(`KYCVerifier.register_kyc(test${i})`, "kyc", kyc, admin, "register_kyc", [who]);
  }
  for (const [i, who] of accounts.entries()) {
    await send(`KYCVerifier.issue_credential(test${i})`, "kyc", kyc, admin, "issue_credential", [who, i + 1]);
  }

  // -- EUR: drip_to_public mints to the CALLER, so each account drips itself ---
  // test0 600 000 (deposits 500 000 below, keeps 100 000); test1/test2 50 000.
  await send("Dripper.drip_to_public(test0, 600000)", "dripper", dripper, admin, "drip_to_public", [eur, 600000]);
  await send("Dripper.drip_to_public(test1, 50000)", "dripper", dripper, test1, "drip_to_public", [eur, 50000]);
  await send("Dripper.drip_to_public(test2, 50000)", "dripper", dripper, test2, "drip_to_public", [eur, 50000]);

  // -- Initial fund deposit by test0: public EUR transfer + private DepositNote --
  // transfer_public_to_public(from, to, amount, nonce): from == caller, so it
  // is self-authorised and nonce = 0.
  await send(`EUR.transfer_public_to_public(test0 -> fund, ${seedAmount})`, "token", eur, admin, "transfer_public_to_public", [admin, fund, seedAmount, 0]);

  // deposit_private attests the hinted KycCredentialNote issued above (same
  // PXE, so it is already discovered) and stamps the deposit's FIFO interval,
  // global seq and small bit from the live public cursor; the contract's
  // only_self tail re-verifies them.
  const kycContract = await Contract.at(kyc, artifacts.kyc, wallet);
  const fundContract = await Contract.at(fund, artifacts.fund, wallet);
  const creds = simValue<{ len: bigint; storage: unknown[] }>(
    await kycContract.methods.get_my_kyc_credentials(admin, 0).simulate({ from: admin }),
  );
  if (BigInt(creds.len) === 0n) {
    throw new Error("test0 has no private KycCredentialNote after issue_credential; the PXE did not discover the note");
  }
  const cursor = simValue<{
    cum_deposits: bigint;
    cum_small_deposits: bigint;
    deposit_seq: bigint;
    small_threshold: bigint;
  }>(await fundContract.methods.get_deposit_cursor_unconstrained().simulate({ from: admin }));
  const isSmall = seedAmount <= BigInt(cursor.small_threshold);
  {
    const t = Date.now();
    await fundContract.methods
      .deposit_private(seedAmount, creds.storage[0], BigInt(cursor.cum_deposits), BigInt(cursor.deposit_seq), isSmall)
      .send({ from: admin, wait });
    log(`HousingFund.deposit_private(test0, ${seedAmount}) ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }

  // -- Result -----------------------------------------------------------------
  const out = {
    node: nodeUrl,
    accounts: {
      test0: admin.toString(),
      test1: test1.toString(),
      test2: test2.toString(),
    },
    contracts: {
      kyc_verifier: kyc.toString(),
      fund_token: token.toString(),
      defi_vault: vault.toString(),
      housing_fund: fund.toString(),
      governance: gov.toString(),
      eur_token: eur.toString(),
      dripper: dripper.toString(),
      property_nft: propertyNft.toString(),
      fsft_dex: dex.toString(),
      protocol_token: protocolToken.toString(),
      protocol_rewards: rewards.toString(),
    },
    params,
    seed: { depositor: admin.toString(), amount: seedAmount.toString() },
  };
  const json = JSON.stringify(out, null, 2);
  if (process.env.FS_DEPLOY_OUT) {
    fs.mkdirSync(path.dirname(process.env.FS_DEPLOY_OUT), { recursive: true });
    fs.writeFileSync(process.env.FS_DEPLOY_OUT, json);
    log(`wrote ${process.env.FS_DEPLOY_OUT}`);
  } else {
    process.stdout.write(json + "\n");
  }
  log(`done: 11 contracts deployed, wired and seeded in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
  await wallet.stop();
}

main().catch((err) => {
  process.stderr.write(`[local-deploy] FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
