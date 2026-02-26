import { readFile } from "node:fs/promises";
import path from "node:path";

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

export async function loadGeneratedArtifactJson(filename: string): Promise<unknown> {
  let lastError: unknown;
  for (const p of candidatePaths(filename)) {
    try {
      const raw = await readFile(p, "utf8");
      return JSON.parse(raw) as unknown;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Artifact not found: ${filename}. Run bootstrap/codegen for live mode. Last error: ${String(lastError)}`
  );
}
