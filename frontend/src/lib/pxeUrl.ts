import { existsSync } from "node:fs";

const DEFAULT_LOCAL_PXE_URL = "http://localhost:8080";
const DEFAULT_TESTNET_PXE_URL = "https://rpc.testnet.aztec-labs.com";

/**
 * Resolve which network we're targeting. `AZTEC_NETWORK=testnet` selects the
 * public Aztec testnet; anything else (default) keeps local-network behaviour.
 */
export function getAztecNetwork(): "local-network" | "testnet" {
  const value = (process.env.AZTEC_NETWORK ?? process.env.NEXT_PUBLIC_AZTEC_NETWORK ?? "")
    .trim()
    .toLowerCase();
  return value === "testnet" ? "testnet" : "local-network";
}

function getConfiguredPxeUrl(): string {
  const explicit = process.env.AZTEC_PXE_URL ?? process.env.NEXT_PUBLIC_AZTEC_PXE_URL;
  if (explicit) return explicit;
  return getAztecNetwork() === "testnet" ? DEFAULT_TESTNET_PXE_URL : DEFAULT_LOCAL_PXE_URL;
}

function isDockerRuntime(): boolean {
  return existsSync("/.dockerenv");
}

/**
 * Resolve a server-reachable PXE URL.
 *
 * In host-local runs, `http://aztec:8080` usually points to a Docker-internal
 * DNS name that cannot be resolved. When detected, we switch to
 * `http://localhost:8080` and keep the original path/query.
 */
export function resolveServerPxeUrl(): string {
  // The server `.send()` flow has no fee-payment method wired (no
  // SponsoredFeePaymentMethod), so it cannot pay fees on the public testnet.
  // Reject `AZTEC_NETWORK=testnet` here rather than silently handing back a
  // testnet RPC URL that every write would fail against.
  if (getAztecNetwork() === "testnet") {
    throw new Error(
      "AZTEC_NETWORK=testnet is not supported by the server flow: no fee-payment " +
        "method is wired (SponsoredFeePaymentMethod), so transactions cannot pay " +
        "fees on testnet. Use the local network."
    );
  }

  const configured = getConfiguredPxeUrl();
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(
      `Invalid Aztec PXE URL '${configured}'. Set AZTEC_PXE_URL or NEXT_PUBLIC_AZTEC_PXE_URL to a valid URL.`
    );
  }

  if (parsed.hostname === "aztec" && !isDockerRuntime()) {
    const fallback = new URL(parsed.toString());
    fallback.hostname = "localhost";
    console.warn(
      `[pxe] Using '${fallback.toString()}' because '${configured}' is Docker-only from this runtime.`
    );
    return fallback.toString();
  }

  return parsed.toString();
}
