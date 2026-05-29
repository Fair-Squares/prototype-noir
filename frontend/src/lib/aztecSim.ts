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
