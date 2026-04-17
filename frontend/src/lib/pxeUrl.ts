import { existsSync } from "node:fs";

const DEFAULT_PXE_URL = "http://localhost:8080";

function getConfiguredPxeUrl(): string {
  return process.env.AZTEC_PXE_URL ?? process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? DEFAULT_PXE_URL;
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
