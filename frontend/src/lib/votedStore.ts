// Secret-ballot governance has no public "did this account vote?" query — that
// is the whole point. To still show "you voted" and disable the buttons, we
// remember a successful vote (or a duplicate-nullifier rejection, which means
// the account already voted) locally in the browser, keyed by account + proposal.
//
// CRITICAL — scope the key by the DEPLOYMENT (the Governance contract address):
// a redeploy spins up a FRESH chain whose proposal ids restart from the low
// numbers, but localStorage PERSISTS across redeploys. Without the deployment
// scope, a stale "voted on proposal 2" flag from a previous deploy makes a
// brand-new proposal 2 (with 0 votes) render "you already voted" for every
// account — the recurring bug. The Governance address changes on every redeploy,
// so scoping by it means a fresh deploy starts with a clean slate (and the v1->v2
// prefix bump abandons any stale unscoped keys already sitting in browsers).
const KEY_PREFIX = "fs_voted_v2";

// The current deployment's Governance address, baked into the client bundle at
// build time (same value used across the app, e.g. reference/page.tsx). Empty in
// simulation / when unset -> a stable "default" namespace so the key is still
// well-formed (sim proposals are server-memory and not chain-redeployed).
function deploymentScope(): string {
  const addr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
  return addr ? addr.toLowerCase() : "default";
}

function key(account: string, proposalId: number): string {
  return `${KEY_PREFIX}:${deploymentScope()}:${account.toLowerCase()}:${proposalId}`;
}

export function markVoted(account: string, proposalId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(account, proposalId), "1");
}

export function hasVotedLocally(account: string, proposalId: number): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key(account, proposalId)) === "1";
}

/** Forget a remembered vote — used when the simulated demo restarts, which
 *  wipes the server-side ballot the flag mirrored. */
export function clearVotedLocally(account: string, proposalId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(account, proposalId));
}
