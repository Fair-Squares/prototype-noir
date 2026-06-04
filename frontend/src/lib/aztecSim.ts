// In aztec.js 4.3.0 a ContractFunctionInteraction.simulate() call resolves to a
// { result, offchainEffects, offchainMessages } wrapper rather than the decoded
// return value directly. Unwrap it so callers get the actual value: a struct
// return decodes to a field-keyed object, a scalar to a bigint/boolean.
export function simResult<T = unknown>(sim: unknown): T {
  if (sim && typeof sim === "object" && "result" in (sim as Record<string, unknown>)) {
    return (sim as { result: T }).result;
  }
  throw new Error("simulate() did not return a { result } wrapper");
}

// A duplicate-nullifier revert is the protocol's single-use guard firing: the
// account already performed this one-time action (voted on a proposal, claimed
// a distribution/reward). Used to turn the raw chain error into a clear message.
export function isDuplicateNullifierError(message: string): boolean {
  return /duplicate (siloed )?nullifier|existing nullifier|nullifier.*already\s*exists/i.test(message);
}

// Maps a raw Noir/aztec assertion string from a governance/fund tx (thrown at
// simulation time, or read off a post-mining reverted receipt) to a clear,
// human message + an appropriate HTTP status. Returns null for unrecognised
// errors so the caller keeps the raw message rather than masking an unknown bug.
export function humanizeContractError(raw: string): { message: string; status: number } | null {
  const m = raw.toLowerCase();
  if (/voting window closed|voting window/.test(m)) {
    return {
      message:
        "The voting window has closed — this proposal's deadline block has passed, so the ballot could not be tallied. Create a new request and vote before its deadline block.",
      status: 409,
    };
  }
  if (/quorum not reached/.test(m)) {
    return {
      message:
        "Not enough votes to finalise — this request did not reach the required number of ballots within its voting window.",
      status: 409,
    };
  }
  if (/proposal is not active|not active|already finali|already executed/.test(m)) {
    return { message: "This proposal is no longer active, so the action can't be completed.", status: 409 };
  }
  if (/has not passed|not passed/.test(m)) {
    return { message: "This proposal has not passed, so it can't be executed.", status: 409 };
  }
  if (/credential revoked/.test(m)) {
    return { message: "Your KYC credential has been revoked, so this action can't be completed.", status: 403 };
  }
  return null;
}
