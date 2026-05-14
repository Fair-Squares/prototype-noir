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
