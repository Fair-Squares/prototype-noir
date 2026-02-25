/**
 * Aztec client utilities for Fair Squares.
 *
 * In simulation mode: not used (API routes handle everything via in-memory state).
 * In live mode (AZTEC_LIVE=true): provides PXE client connection.
 *
 * This module is kept for future use when connecting to a real Aztec sandbox.
 */

const PXE_URL = process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://localhost:8080";

export function getPXEUrl(): string {
  return PXE_URL;
}

export function isLiveMode(): boolean {
  return (
    process.env.AZTEC_LIVE === "true" ||
    process.env.NEXT_PUBLIC_SIMULATION === "false"
  );
}
