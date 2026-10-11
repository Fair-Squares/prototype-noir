/**
 * Fair Squares -- TS aztec.js E2E harness (W3a)
 *
 * A minimal, standalone harness for exercising the contracts' PRIVATE
 * (hinted-note) flows against the RUNNING docker local-network node. These
 * flows cannot be covered by Noir `aztec test` (TestEnvironment can only hint a
 * note at a known storage slot, not a *contract-created* note); upstream Aztec
 * covers the equivalent shape (claim_contract / crowdfunding) only via a TS
 * aztec.js e2e. See docs/PHASE2_COVENANT_RECONCILIATION_HARDENING.md (W3a).
 *
 * The connection recipe mirrors the already-proven scripts/seed-v2-deposit.ts:
 * an in-process EmbeddedWallet over a node client, the three canonical Schnorr
 * test accounts, and node.getContract + registerContract before any
 * simulate/send (EmbeddedWallet's PXE doesn't know CLI-deployed contracts).
 *
 * Run AFTER the docker stack's aztec-bootstrap container has exited 0, on a
 * quiet host (no concurrent host-side `aztec compile`/`aztec test` -- the
 * bind-mount race truncates the contracts target dirs). See scripts/e2e/README.md.
 */

import * as fs from "fs";
import * as path from "path";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { createAztecNodeClient, type AztecNode } from "@aztec-labs/aztec.js/node";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

export const NODE_URL =
  process.env.AZTEC_NODE_URL ?? process.env.PXE_URL ?? "http://localhost:8080";

export function log(tag: string, msg: string): void {
  console.log(`[${tag}] ${msg}`);
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(
      `${key} not set. Load frontend/.env.local before running -- see scripts/e2e/README.md`,
    );
  }
  return v;
}

/** Resolve a generated artifact JSON: prefer the build-generated frontend copy
 *  (NOT the per-contract target dir, which the docker bootstrap races on). */
function loadRawArtifact(name: string): Parameters<typeof loadContractArtifact>[0] {
  const candidates = [
    path.resolve(__dirname, `../../frontend/src/artifacts/${name}.json`),
    path.resolve(__dirname, `../../contracts/${name.split("-")[0]}/target/${name}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  throw new Error(
    `Could not locate artifact for ${name}. Tried:\n  ${candidates.join("\n  ")}`,
  );
}

export interface Harness {
  node: AztecNode;
  wallet: EmbeddedWallet;
  /** [test0, test1, test2] -- test0 is the bootstrap admin. */
  addresses: AztecAddress[];
}

export async function connect(): Promise<Harness> {
  log("harness", `connecting to ${NODE_URL} ...`);
  const node = createAztecNodeClient(NODE_URL);
  // ephemeral:true => in-memory PXE stores (no on-disk pxe_data dir, which also
  // avoids EACCES when run from a dir the wallet can't write). proverEnabled:false
  // matches the docker node (PXE_PROVER_ENABLED=false) -- skips ~4s/tx proving.
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxe: { proverEnabled: false },
  } as unknown as Parameters<typeof EmbeddedWallet.create>[1]);
  // Match bootstrap / serverWallet WALLET_MIN_FEE_PADDING -- local fee spikes
  // otherwise trip maxFeesPerGas >= gasFees and revert sends.
  (wallet as unknown as { setMinFeePadding?: (n: number) => void }).setMinFeePadding?.(30);

  const data = await getInitialTestAccountsData();
  const addresses: AztecAddress[] = [];
  for (const a of data) {
    // CRITICAL: pass signingKey (3rd arg) so the derived address matches the
    // bootstrap-seeded test account (KYC'd, funded). Omitting it derives a
    // DIFFERENT address with no credential/EUR (seed-v2-deposit.ts:75-79).
    const acct = await wallet.createSchnorrAccount(a.secret, a.salt, a.signingKey);
    addresses.push(acct.address);
  }
  // NOTE on cross-PXE note discovery: a fresh ephemeral PXE rediscovers the KYC
  // credential issued at bootstrap (get_my_kyc_credentials -> 1) but NOT a
  // DepositNote minted by another process's PXE (get_my_deposit_notes -> 0).
  // So flows that need a deposit note CREATE it in-process via deposit_private
  // (using the discoverable KYC hint) -- the same self-contained pattern flow #1
  // uses for its reward note. Don't rely on reading another PXE's deposit notes.
  log("harness", `accounts: ${addresses.map((a) => a.toString().slice(0, 10)).join(", ")}`);
  return { node, wallet, addresses };
}

/** Fetch a deployed instance from the node, register it in the wallet's PXE
 *  (mandatory before simulate/send), and return a method-bound Contract. */
export async function loadContract(
  h: Harness,
  address: string,
  artifactName: string,
): Promise<Contract> {
  const addr = AztecAddress.fromStringUnsafe(address);
  const instance = await h.node.getContract(addr);
  if (!instance) throw new Error(`${artifactName} ${address} not deployed on node ${NODE_URL}`);
  const artifact = loadContractArtifact(loadRawArtifact(artifactName));
  await h.wallet.registerContract(instance, artifact);
  return Contract.at(addr, artifact, h.wallet);
}

/** Tolerant unwrap of a 4.3.0 simulate() result: returns `result` when the
 *  call resolves to a `{ result, offchainEffects, offchainMessages }` wrapper
 *  (aztecSim.ts), else the value directly (seed-v2-deposit.ts). */
export function simValue<T = unknown>(sim: unknown): T {
  if (sim && typeof sim === "object" && "result" in (sim as Record<string, unknown>)) {
    return (sim as { result: T }).result;
  }
  return sim as T;
}

/** Replicates frontend getAztecTxOutcome: a default send() AWAITS inclusion and
 *  RESOLVES even when the public tail reverts post-mining -- the revert lives in
 *  `executionResult` / `error`, not a throw. Callers MUST inspect this. */
export function txReverted(receipt: unknown): { reverted: boolean; error: string | null } {
  const top = receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : {};
  const inner =
    (top.receipt as Record<string, unknown> | undefined) ??
    (top.txReceipt as Record<string, unknown> | undefined) ??
    top;
  const execResult = inner.executionResult;
  const revertedByField = typeof execResult === "string" && execResult.toLowerCase() === "reverted";
  const maybeFn = (inner as { hasExecutionReverted?: () => boolean }).hasExecutionReverted;
  const revertedByMethod = typeof maybeFn === "function" ? Boolean(maybeFn.call(inner)) : false;
  const err = inner.error;
  return {
    reverted: revertedByField || revertedByMethod,
    error: err === undefined || err === null ? null : String(err),
  };
}

// A ContractFunctionInteraction -- loosely typed (tsx strips types; the real
// shape is from @aztec-labs/aztec.js). Just needs `.send({ from })`.
type Interaction = { send: (opts: { from: AztecAddress }) => Promise<unknown> };

/** Send a tx that MUST succeed: throws on a pre-mining throw OR a post-mining
 *  revert (no silent success -- per CLAUDE.md error-handling rules). */
export async function sendOk(
  interaction: Interaction,
  from: AztecAddress,
  label: string,
): Promise<unknown> {
  const receipt = await interaction.send({ from });
  const { reverted, error } = txReverted(receipt);
  if (reverted) throw new Error(`${label} reverted post-mining: ${error ?? "unknown"}`);
  return receipt;
}

/** Send a tx that is EXPECTED to fail. Returns how it failed (threw vs
 *  reverted) so the caller can assert on it. */
export async function sendExpectFail(
  interaction: Interaction,
  from: AztecAddress,
): Promise<{ failed: boolean; how: string }> {
  try {
    const receipt = await interaction.send({ from });
    const { reverted, error } = txReverted(receipt);
    return reverted
      ? { failed: true, how: `reverted post-mining: ${error ?? "unknown"}` }
      : { failed: false, how: "resolved WITHOUT a revert (unexpected)" };
  } catch (e) {
    return { failed: true, how: `threw at send: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ===========================================================================
// SHARED E2E HELPERS (W3 -- used by every private-flow e2e so they all match)
//
// These wrap the recurring "read a hint / mint a note in-process / run the
// admin setup / assert allocation math" steps that the 6 flows share. They are
// loosely typed on purpose (tsx strips types; the real Contract/Interaction
// shapes come from @aztec-labs/aztec.js) and each asserts its own preconditions
// rather than masking a missing note with a fallback (CLAUDE.md error rules).
//
// Note on artifact naming (loadContract 2nd arg), so callers stay consistent:
//   HousingFund   -> housing_fund-HousingFund
//   KYCVerifier   -> kyc_verifier-KYCVerifier
//   Governance    -> governance-Governance
//   FSFTDex       -> fsft_dex-FSFTDex
//   ProtocolRewards -> protocol_rewards-ProtocolRewards
//   EUR + FUND tokens -> token_contract-Token   (protocol token -> protocol_rewards-Token)
// ===========================================================================

// A method-bound Contract -- loosely typed (we only ever touch `.methods.*`).
type AnyContract = { methods: any };

/** A 4.3.0 BoundedVec decodes to { len, storage: [...] }; storage[i] is a
 *  ready HintedNote -- pass it straight to the consuming private fn. NEVER
 *  construct a hint manually / call packAsHintedNote (GOTCHA #2). */
export type BoundedVec = { len: bigint; storage: unknown[] };

/** Mirror of HousingFund's DepositCursor view (get_deposit_cursor_unconstrained). */
export type DepositCursor = {
  cum_deposits: bigint;
  cum_small_deposits: bigint;
  deposit_seq: bigint;
  small_threshold: bigint;
};

/** Mirror of HousingFund's DistributionStatus view -- returned by BOTH
 *  get_rent_distribution_status(epoch) and get_distribution_status(proposal).
 *  The four snapshot params the private claim/reinvest must supply are
 *  small_pool / small_total / fifo_cap / snapshot_block. */
export type DistributionStatus = {
  open: boolean;
  amount: bigint;
  snapshot_total?: bigint;
  small_total: bigint;
  small_pool: bigint;
  fifo_cap: bigint;
  claimed_total: bigint;
  snapshot_block: bigint;
};

/** The snapshot params a private claim/reinvest/distribution supplies, pulled
 *  from a DistributionStatus (rent epoch OR proposal distribution). */
export type Snapshot = {
  smallPool: bigint;
  smallTotal: bigint;
  fifoCap: bigint;
  snapshotBlock: number;
  amount: bigint;
  claimedTotal: bigint;
};

/** Pull the four snapshot params (plus amount/claimedTotal) out of a raw
 *  DistributionStatus view. Works for rent epochs and proposal distributions. */
export function snapshotOf(st: DistributionStatus): Snapshot {
  return {
    smallPool: BigInt(st.small_pool),
    smallTotal: BigInt(st.small_total),
    fifoCap: BigInt(st.fifo_cap),
    snapshotBlock: Number(st.snapshot_block),
    amount: BigInt(st.amount),
    claimedTotal: BigInt(st.claimed_total),
  };
}

/**
 * Pure TS mirror of HousingFund's allocation math (contracts/housing_fund/
 * src/main.nr fifo_share + small_share + total_claim). Integer-exact, same
 * order as the circuit. For a FRESH in-process deposit, cum_before is far past
 * fifo_cap so fifo_share is 0 and the whole claim is the small-pool share
 * (small_pool * amount / small_total) -- which is why test deposits are sized
 * AT the small_threshold (is_small=true, and they bump small_total). (GOTCHA #7)
 */
export function fifoShare(cumBefore: bigint, amount: bigint, fifoCap: bigint): bigint {
  const hi = cumBefore + amount;
  if (cumBefore >= fifoCap) return 0n;
  const cappedHi = hi < fifoCap ? hi : fifoCap;
  return cappedHi - cumBefore;
}

export function smallShare(amount: bigint, isSmall: boolean, smallPool: bigint, smallTotal: bigint): bigint {
  if (!isSmall || smallTotal === 0n) return 0n;
  return (smallPool * amount) / smallTotal;
}

export function totalClaim(
  amount: bigint,
  cumBefore: bigint,
  isSmall: boolean,
  smallPool: bigint,
  smallTotal: bigint,
  fifoCap: bigint,
): bigint {
  return fifoShare(cumBefore, amount, fifoCap) + smallShare(amount, isSmall, smallPool, smallTotal);
}

/** Read the caller's discoverable KYC credential hint (storage[0]). A fresh
 *  ephemeral PXE rediscovers the bootstrap-issued credential (len >= 1), so
 *  this needs no in-process creation. Throws if the owner has no credential. */
export async function kycHint(
  _h: Harness,
  kyc: AnyContract,
  owner: AztecAddress,
): Promise<unknown> {
  const creds = simValue<BoundedVec>(
    await kyc.methods.get_my_kyc_credentials(owner, 0).simulate({ from: owner }),
  );
  if (BigInt(creds.len) < 1n) {
    throw new Error(
      `${owner.toString().slice(0, 10)} has no KYC credential -- did bootstrap issue_credential run?`,
    );
  }
  const hint = creds.storage[0];
  if (!hint) throw new Error("KYC hint (storage[0]) is empty");
  return hint;
}

/** Read HousingFund's FIFO cursors + small threshold. */
export async function depositCursor(
  _h: Harness,
  hf: AnyContract,
  from: AztecAddress,
): Promise<DepositCursor> {
  return simValue<DepositCursor>(
    await hf.methods.get_deposit_cursor_unconstrained().simulate({ from }),
  );
}

/**
 * Read ALL of `owner`'s DepositNotes across every page (get_my_deposit_notes is
 * paged at MAX_NOTES_PER_PAGE == 10). On the long-lived docker node a test
 * account accumulates >10 notes across re-runs, so a freshly-minted note lands
 * on page 1+ and is INVISIBLE to a page-0-only read. Returns the flat list of
 * real HintedNotes in note order (page 0 first), so the just-minted note is the
 * last element. Stops at the first non-full page (no more notes).
 */
export async function allDepositNotes(
  hf: AnyContract,
  owner: AztecAddress,
): Promise<unknown[]> {
  const MAX_PER_PAGE = 10; // aztec-nr note::constants::MAX_NOTES_PER_PAGE
  const notes: unknown[] = [];
  // Hard page cap guards against a contract bug returning a permanently-full
  // page (would otherwise loop forever); 100 pages == 1000 notes is plenty.
  for (let page = 0; page < 100; page++) {
    const v = simValue<BoundedVec>(
      await hf.methods.get_my_deposit_notes(owner, page).simulate({ from: owner }),
    );
    const len = Number(v.len);
    for (let i = 0; i < len; i++) {
      const hn = v.storage[i];
      if (!hn) throw new Error(`deposit hint (page ${page}, storage[${i}]) is empty`);
      notes.push(hn);
    }
    if (len < MAX_PER_PAGE) break; // last (partial) page reached
  }
  return notes;
}

export interface DepositResult {
  /** The in-process DepositNote's ready HintedNote (storage[0]) -- pass straight
   *  to claim_rent_private / reinvest_rent_private / claim_distribution_private /
   *  cast_vote_private. */
  depositHint: unknown;
  /** The deposit amount (== small_threshold, so is_small). */
  amount: bigint;
  /** Always true here (sized AT the small threshold). */
  isSmall: boolean;
  /** The global FIFO cursor read BEFORE the deposit (the note's cum_before). */
  cumBefore: bigint;
  /** The global sequence read BEFORE the deposit (the note's seq). */
  seq: bigint;
  /** How many of `owner`'s DepositNotes exist after this deposit. */
  noteCount: bigint;
}

/**
 * Mint a fresh DepositNote IN-PROCESS for `owner` and read its hint back.
 * A fresh ephemeral PXE cannot rediscover a DepositNote minted by another
 * process (GOTCHA #4), so every flow that consumes one must create it here.
 *
 * Sizes the deposit AT the small_threshold so is_small=true and the note earns
 * a non-zero small-pool share (a fresh deposit's FIFO share is 0). Reads the
 * KYC hint, the cursors BEFORE depositing (those become the note's cum_before/
 * seq -- supply them unchanged to reinvest_rent_private), runs deposit_private,
 * then reads get_my_deposit_notes for the new hint.
 *
 * opts.amount overrides the deposit size (still flagged is_small iff
 * amount <= small_threshold). opts.hintIndex picks which note hint to return
 * (default: the last one, i.e. the one just minted).
 */
export async function depositInProcess(
  h: Harness,
  hf: AnyContract,
  kyc: AnyContract,
  owner: AztecAddress,
  opts?: { amount?: bigint; hintIndex?: number },
): Promise<DepositResult> {
  const hint = await kycHint(h, kyc, owner);
  const cursor = await depositCursor(h, hf, owner);
  const amount = opts?.amount ?? BigInt(cursor.small_threshold);
  const cumBefore = BigInt(cursor.cum_deposits);
  const seq = BigInt(cursor.deposit_seq);
  const isSmall = amount <= BigInt(cursor.small_threshold);

  // Count across ALL pages: on the long-lived node an account accumulates >10
  // deposit notes, so the just-minted note lands on a later page -- a page-0-only
  // read would see len stuck at 10 and wrongly conclude the mint failed.
  const before = await allDepositNotes(hf, owner);
  const countBefore = BigInt(before.length);

  await sendOk(
    hf.methods.deposit_private(amount, hint, cumBefore, seq, isSmall),
    owner,
    "deposit_private",
  );

  const after = await allDepositNotes(hf, owner);
  const noteCount = BigInt(after.length);
  if (noteCount <= countBefore) {
    throw new Error(
      `deposit_private did not mint a DepositNote for ${owner.toString().slice(0, 10)} (len ${countBefore} -> ${noteCount})`,
    );
  }
  // `after` is the flat list of REAL notes (padding already stripped per page),
  // in note order, so the freshly minted note is the last element (index len-1).
  const realLen = Number(noteCount);
  const idx = opts?.hintIndex ?? realLen - 1;
  if (idx < 0 || idx >= realLen) {
    throw new Error(`deposit hint index ${idx} out of range [0, ${realLen}) for ${owner.toString().slice(0, 10)}`);
  }
  const depositHint = after[idx];
  if (!depositHint) throw new Error(`deposit hint (storage[${idx}]) is empty`);

  return { depositHint, amount, isSmall, cumBefore, seq, noteCount };
}

/**
 * Admin setup for a rent epoch: wire the EUR token (idempotent), post rent into
 * the undistributed pool, and open the rent distribution for `epoch`. Returns
 * the snapshot params (smallPool/smallTotal/fifoCap/snapshotBlock) the private
 * claim/reinvest must supply. Asserts the epoch was NOT already open (GOTCHA #5).
 */
export async function openRentEpoch(
  _h: Harness,
  hf: AnyContract,
  admin: AztecAddress,
  args: { epoch: number; amount: bigint; eurAddr: string },
): Promise<Snapshot> {
  const pre = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(args.epoch).simulate({ from: admin }),
  );
  if (pre.open) {
    throw new Error(
      `rent epoch ${args.epoch} is already open -- re-run with a fresh RENT_EPOCH index`,
    );
  }
  await sendOk(
    hf.methods.set_eur_token(AztecAddress.fromStringUnsafe(args.eurAddr)),
    admin,
    "set_eur_token",
  );
  await sendOk(hf.methods.record_rent(0, args.amount), admin, "record_rent");
  await sendOk(
    hf.methods.open_rent_distribution(args.epoch, args.amount),
    admin,
    "open_rent_distribution",
  );
  const st = simValue<DistributionStatus>(
    await hf.methods.get_rent_distribution_status(args.epoch).simulate({ from: admin }),
  );
  if (!st.open) throw new Error(`open_rent_distribution(${args.epoch}) did not open the epoch`);
  return snapshotOf(st);
}

/**
 * Push the chain past a voting deadline with `n` cheap filler txs. Each
 * set_ror_bps(currentRor) is an admin-only IDEMPOTENT write that still mines a
 * block (the housing_fund admin == test0) without changing any state -- it reads
 * the live ror_bps and writes the SAME value back, so concurrent flows that read
 * ROR are unaffected. (record_rent(0, 0) used to be the filler, but record_rent
 * now asserts `amount > 0`, so a zero-amount call reverts -- GOTCHA: a filler
 * tx must be a real, succeeding admin call.) Used to age a proposal to its
 * deadline before finalize_proposal (the 12-block governance window).
 */
export async function advanceBlocks(
  _h: Harness,
  hf: AnyContract,
  admin: AztecAddress,
  n: number,
): Promise<void> {
  // Read the live ROR once so the filler write is a true no-op (same value back).
  const ror = BigInt(
    simValue<bigint>(await hf.methods.get_ror_bps().simulate({ from: admin })),
  );
  for (let i = 0; i < n; i++) {
    // set_ror_bps(ror) mines a block, admin-only (proves liveness), and writes
    // back the SAME bps -- no observable state change.
    await sendOk(hf.methods.set_ror_bps(ror), admin, `advanceBlocks[${i}]`);
  }
}

export interface ProposalResult {
  proposalId: number;
  /** The distribution snapshot params after open_distribution(proposalId). */
  snapshot: Snapshot;
  /** Each voter's in-process deposit (depositHint etc.), in voter order. */
  deposits: DepositResult[];
}

/**
 * Drive a governance proposal all the way to an OPEN FSFT distribution:
 *   create_proposal(proposer) -> each voter gets an in-process deposit + KYC
 *   hint and cast_vote_private(yes) -> advanceBlocks past the 12-block window
 *   -> finalize_proposal -> execute_proposal(admin) -> open_distribution(admin).
 *
 * Returns { proposalId, snapshot (from get_distribution_status), deposits[] }.
 * `proposer` is the admin (execute_proposal / open_distribution are admin-only).
 * Each voter votes exactly once; quorum is 2 yes votes (pass >= 2 voters).
 * windowBlocks defaults to 14 (> the 12-block window) so finalize succeeds.
 */
export async function runProposalToExecuted(
  h: Harness,
  gov: AnyContract,
  hf: AnyContract,
  kyc: AnyContract,
  args: {
    proposer: AztecAddress;
    voters: AztecAddress[];
    amount: bigint;
    descHash?: bigint;
    windowBlocks?: number;
    openDistribution?: boolean;
  },
): Promise<ProposalResult> {
  const countBefore = Number(
    simValue<bigint>(await gov.methods.get_proposal_count().simulate({ from: args.proposer })),
  );
  await sendOk(
    gov.methods.create_proposal(args.descHash ?? 1n, args.amount),
    args.proposer,
    "create_proposal",
  );
  const proposalId = countBefore; // create_proposal returns the prior count

  // Each voter mints a fresh DepositNote (fund exposure proof) + uses its KYC
  // hint, then votes YES. Deposits happen before voting so cast_vote can prove
  // exposure against an in-process note.
  const deposits: DepositResult[] = [];
  for (const voter of args.voters) {
    const dep = await depositInProcess(h, hf, kyc, voter);
    deposits.push(dep);
    const kHint = await kycHint(h, kyc, voter);
    await sendOk(
      gov.methods.cast_vote_private(proposalId, true, kHint, dep.depositHint),
      voter,
      `cast_vote_private[${voter.toString().slice(0, 10)}]`,
    );
  }

  await advanceBlocks(h, hf, args.proposer, args.windowBlocks ?? 14);
  await sendOk(gov.methods.finalize_proposal(proposalId), args.proposer, "finalize_proposal");
  await sendOk(gov.methods.execute_proposal(proposalId), args.proposer, "execute_proposal");

  let snapshot: Snapshot = {
    smallPool: 0n, smallTotal: 0n, fifoCap: 0n, snapshotBlock: 0, amount: 0n, claimedTotal: 0n,
  };
  if (args.openDistribution ?? true) {
    await sendOk(hf.methods.open_distribution(proposalId), args.proposer, "open_distribution");
    const st = simValue<DistributionStatus>(
      await hf.methods.get_distribution_status(proposalId).simulate({ from: args.proposer }),
    );
    if (!st.open) throw new Error(`open_distribution(${proposalId}) did not open the distribution`);
    snapshot = snapshotOf(st);
  }

  return { proposalId, snapshot, deposits };
}
