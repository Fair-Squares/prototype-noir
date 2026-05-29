// Secret-ballot governance has no public "did this account vote?" query — that
// is the whole point. To still show "you voted" and disable the buttons, we
// remember a successful vote (or a duplicate-nullifier rejection, which means
// the account already voted) locally in the browser, keyed by account + proposal.
const KEY_PREFIX = "fs_voted_v1";

function key(account: string, proposalId: number): string {
  return `${KEY_PREFIX}:${account.toLowerCase()}:${proposalId}`;
}

export function markVoted(account: string, proposalId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(account, proposalId), "1");
}

export function hasVotedLocally(account: string, proposalId: number): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key(account, proposalId)) === "1";
}
