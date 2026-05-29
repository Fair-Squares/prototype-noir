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
