import { readFile } from "node:fs/promises";
import path from "node:path";
import type { loadContractArtifact } from "@aztec/aztec.js/abi";

// The deserialized artifact type, derived without a runtime import of aztec.js
// (this binding is type-only and erased at build).
type ContractArtifact = ReturnType<typeof loadContractArtifact>;

function candidatePaths(filename: string): string[] {
  const contractName = filename.split("-")[0] ?? "";
  // Prefer freshly compiled local targets (workspace root execution).
  const p0 = contractName
    ? path.join(process.cwd(), "contracts", contractName, "target", filename)
    : "";
  // Prefer freshly compiled local targets (frontend cwd execution).
  const p0b = contractName
    ? path.join(process.cwd(), "..", "contracts", contractName, "target", filename)
    : "";
  // Frontend service / Vercel (cwd at frontend root)
  const p1 = path.join(process.cwd(), "src", "artifacts", filename);
  // Monorepo root local execution
  const p2 = path.join(process.cwd(), "frontend", "src", "artifacts", filename);
  return [p0, p0b, p1, p2].filter((p) => p.length > 0);
}

// Artifacts only change on recompile, so the parsed JSON and the deserialized
// ContractArtifact are stable for the life of the process. Cache both: each
// artifact is multi-MB (FSFTDex ~1.8 MB, Token ~3.3 MB), so re-reading and
// re-parsing them on every request is wasted work on a hot path.
const rawCache = new Map<string, unknown>();
const artifactCache = new Map<string, ContractArtifact>();

export async function loadGeneratedArtifactJson(filename: string): Promise<unknown> {
  const cached = rawCache.get(filename);
  if (cached !== undefined) return cached;

  let lastError: unknown;
  for (const p of candidatePaths(filename)) {
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      rawCache.set(filename, parsed);
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Artifact not found: ${filename}. Run bootstrap/codegen for live mode. Last error: ${String(lastError)}`
  );
}

// Load + deserialize an artifact into a ContractArtifact ready for Contract.at.
// Memoized, so the deserialize cost is paid once per artifact. Replaces the
// repeated `loadContractArtifact((await loadGeneratedArtifactJson(...)) as ...)`
// boilerplate (and its cast) across the live API routes.
export async function loadArtifact(filename: string): Promise<ContractArtifact> {
  const cached = artifactCache.get(filename);
  if (cached !== undefined) return cached;

  const { loadContractArtifact: deserialize } = await import("@aztec/aztec.js/abi");
  const json = await loadGeneratedArtifactJson(filename);
  const artifact = deserialize(json as Parameters<typeof deserialize>[0]);
  artifactCache.set(filename, artifact);
  return artifact;
}
