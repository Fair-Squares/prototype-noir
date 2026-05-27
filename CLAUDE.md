# Aztec Project

This file is the canonical agent guide for this repo. [AGENTS.md](./AGENTS.md) is a stub that points here so Codex (and any other tool that reads `AGENTS.md`) gets the same instructions.

## Critical: Use `aztec` CLI, not `nargo` directly

This is an Aztec smart contract project. Always use the `aztec` CLI wrapper instead of calling `nargo` directly:

- **Compile**: `aztec compile` (NOT `nargo compile`). Using `nargo compile` alone produces incomplete artifacts.
- **Test**: `aztec test` (NOT `nargo test`).
- **Other nargo commands** like `nargo fmt` and `nargo doc` are fine to use directly.

## Error Handling

- NEVER silently swallow errors or fall back to default values. If a value is required, throw if it's missing.
- NEVER use fallback values like `AztecAddress.ZERO`, `"unknown"`, `0`, or `null` to mask missing data. These hide bugs and cause failures elsewhere that are harder to trace.
- NEVER add retry/polling logic unless explicitly asked. Retry loops with long timeouts may brick application loops and mask the real error.
- NEVER wrap calls in try/catch that returns null or a default. Let errors propagate.
- If a precondition isn't met, throw immediately with a descriptive message -- don't try to "work around" it.
- Prefer `T` return types over `T | null` when null would indicate a bug rather than a valid state.
- Do not add `.catch(() => defaultValue)` to promises. If something fails, the caller needs to know.

## Version Compatibility

The Aztec developer SDK/aztec-nr version (used for writing and compiling contracts) may differ from the node version (used by operators to run the network). Check the [Networks page](https://docs.aztec.network/networks) for current network versions. When in doubt, use the version from the developer docs you are reading -- it is the correct SDK version for contract development on that network.

## Hashing: Default to Poseidon2

When writing Aztec.nr contract code that requires hashing, **always use Poseidon2** unless a specific protocol or interoperability requirement calls for a different hash.

- **Default**: `use aztec::protocol::hash::poseidon2_hash;`
- **Do NOT** default to Pedersen (`pedersen_hash`). Pedersen is available but Poseidon2 is cheaper in circuits and is the standard across Aztec.
- If you are unsure which hash to use, use Poseidon2.

## Frontend design system

Use the type scale defined in `frontend/src/app/globals.css` and the primitives in `frontend/src/components/SimplePage.tsx`. Do not invent new sizes per page.

- Single font: Plus Jakarta Sans (400 / 500 / 600 / 700).
- Four sizes: page title (h1 / `.text-display` 28px), section heading (h2 / `.text-heading` 18px), body (16px default), meta (`.text-meta` 14px).
- Single card style: `rounded-2xl border border-border bg-card p-5`.
- Reuse `PageHero`, `MetricRow`, `PrimaryCard`, `ActionPanel`, `AdvancedDetails` instead of building per-page chrome.
