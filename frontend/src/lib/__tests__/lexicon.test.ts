/**
 * Lexicon guard (UX overhaul Phase 0 — docs/UX_FINAL_SIMPLIFICATION_PLAN.md §1).
 *
 * Extracts user-visible strings (string literals + JSX text) from the primary
 * UI sources and fails when a Tier-3 banned term appears that is not in the
 * ratchet baseline below. The baseline pins the leaks that existed when the
 * guard landed; overhaul phases 1-5 shrink it to empty. Rules:
 *
 *  - NEW leak (file/term not in baseline)  → fix the copy, don't extend the
 *    baseline, unless the surface is explicitly sanctioned Tier-3 (then add
 *    it to EXCLUDED, not to the baseline).
 *  - Baseline entry no longer found        → you fixed copy; DELETE the entry
 *    in the same commit so the ratchet only ever tightens.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_PRIMARY_UI_TERMS } from "../lexicon";

const SRC = join(process.cwd(), "src");

/** Primary-UI roots to scan (relative to src/). */
const SCAN_ROOTS = ["app", "components"];

/** Sanctioned Tier-3 surfaces + non-UI code, never scanned. */
const EXCLUDED_PREFIXES = [
  "app/api/", // server routes — not user-visible copy
  "app/reference/", // sanctioned dense technical surface
  "components/reference/", // sanctioned dense technical surface
];
const EXCLUDED_FILES = new Set([
  "components/projects/ProjectDetailProofs.tsx", // sanctioned on-chain record panel
  // The old /reference surface, folded into /learn behind AdvancedDetails —
  // the ONE sanctioned dense technical panel (plan §4.8) + its block ticker.
  "components/about/ParametersPanel.tsx",
  "components/shell/BlockTicker.tsx",
]);

/**
 * RATCHET BASELINE — the Tier-3 leaks present when the guard landed
 * (file → sorted banned-term names). Phases 1-5 delete entries as copy is
 * rewritten; this object must reach {} by Phase 6.
 */
const KNOWN_OFFENDERS: Record<string, string[]> = {};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments (not user-visible), keeping line structure irrelevant here. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** Extract the user-visible text: string literals plus JSX text nodes. */
function extractVisibleText(source: string): string[] {
  const stripped = stripComments(source);
  const out: string[] = [];
  const literal = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const match of stripped.match(literal) ?? []) {
    out.push(match.slice(1, -1));
  }
  // JSX text: letters between a closing `>` and the next `<`, no expressions.
  // TS generics (`useState<T>(...)`) produce pseudo-captures of code — real
  // copy never contains `;` or `=`, so those captures are dropped.
  const jsxText = />([^<>{}"'`]*[A-Za-z][^<>{}"'`]*)</g;
  let m: RegExpExecArray | null;
  while ((m = jsxText.exec(stripped)) !== null) {
    if (!/[;=]/.test(m[1])) out.push(m[1]);
  }
  return out;
}

function scan(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(SRC, root))) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (EXCLUDED_FILES.has(rel)) continue;
      const texts = extractVisibleText(readFileSync(file, "utf8"));
      const hits = new Set<string>();
      for (const term of BANNED_PRIMARY_UI_TERMS) {
        if (texts.some((t) => term.pattern.test(t))) hits.add(term.name);
      }
      if (hits.size > 0) found[rel] = [...hits].sort();
    }
  }
  return Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
}

describe("lexicon guard — Tier-3 terms stay out of primary UI", () => {
  it("matches the ratchet baseline exactly (fix copy or delete stale entries)", () => {
    const found = scan();
    expect(found).toEqual(KNOWN_OFFENDERS);
  });
});
