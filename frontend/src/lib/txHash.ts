type TxHashLike = {
  txHash?: { toString: () => string } | string | null;
  txReceipt?: TxHashLike | null;
  receipt?: TxHashLike | null;
};

function asTxHashLike(value: unknown): TxHashLike | null {
  return value && typeof value === "object" ? (value as TxHashLike) : null;
}

export function getAztecTxHash(value: unknown): string | undefined {
  const result = asTxHashLike(value);
  const txHash = result?.txHash ?? result?.txReceipt?.txHash ?? result?.receipt?.txHash;
  if (!txHash) return undefined;
  return typeof txHash === "string" ? txHash : txHash.toString();
}

export function requireAztecTxHash(value: unknown): string {
  const txHash = getAztecTxHash(value);
  if (!txHash) {
    throw new Error("Transaction receipt missing txHash");
  }
  return txHash;
}

export interface AztecTxMeta {
  txHash: string;
  blockNumber: number | null;
  status: string | null;
}

/** Extracts hash + inclusion metadata (block number, status) from a send() receipt. */
export function getAztecTxMeta(receipt: unknown): AztecTxMeta {
  const txHash = requireAztecTxHash(receipt);
  const top = receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : {};
  // wallet sendTx() resolves to { receipt: TxReceipt, ...offchainOutput }, so the
  // block number / status live on the nested receipt, not the top-level object.
  const inner =
    (top.receipt as Record<string, unknown> | undefined) ??
    (top.txReceipt as Record<string, unknown> | undefined) ??
    top;
  const blockRaw = inner.blockNumber;
  const blockNumber =
    blockRaw === null || blockRaw === undefined ? null : Number(blockRaw as number);
  const status = inner.status === undefined || inner.status === null ? null : String(inner.status);
  return {
    txHash,
    blockNumber: blockNumber !== null && Number.isFinite(blockNumber) ? blockNumber : null,
    status,
  };
}

export interface AztecTxOutcome extends AztecTxMeta {
  /** True when the tx was mined but its (public) execution reverted. */
  reverted: boolean;
  /** Revert/error description from the receipt, if any. */
  error: string | null;
}

/**
 * Like getAztecTxMeta but also reports whether a MINED tx reverted. A default
 * `.send({ from })` awaits inclusion and resolves even when the public tail
 * reverts post-mining (e.g. an enqueued tally hitting "voting window closed").
 * `TxReceipt.status` only carries finalization state, so the revert lives in
 * `executionResult` ("reverted") / `error`. Callers MUST inspect this instead
 * of assuming a resolved send() succeeded — otherwise a reverted tx is reported
 * as success (see CLAUDE.md error-handling rules).
 */
export function getAztecTxOutcome(receipt: unknown): AztecTxOutcome {
  const meta = getAztecTxMeta(receipt);
  const top = receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : {};
  const inner =
    (top.receipt as Record<string, unknown> | undefined) ??
    (top.txReceipt as Record<string, unknown> | undefined) ??
    top;
  // executionResult is the authoritative field ("success" | "reverted"); fall
  // back to a hasExecutionReverted() method if the receipt is a live instance.
  const execResult = inner.executionResult;
  const revertedByField = typeof execResult === "string" && execResult.toLowerCase() === "reverted";
  const maybeFn = (inner as { hasExecutionReverted?: () => boolean }).hasExecutionReverted;
  const revertedByMethod = typeof maybeFn === "function" ? Boolean(maybeFn.call(inner)) : false;
  const errRaw = inner.error;
  return {
    ...meta,
    reverted: revertedByField || revertedByMethod,
    error: errRaw === undefined || errRaw === null ? null : String(errRaw),
  };
}
