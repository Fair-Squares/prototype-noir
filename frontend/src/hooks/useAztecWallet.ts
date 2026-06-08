"use client";

/**
 * useAztecWallet — lightweight test account selector for the devnet prototype.
 *
 * No BrowserEmbeddedWallet. No WASM. No Web Workers.
 *
 * Persists the active account index in localStorage so navigation between
 * pages (invest, governance, kyc, portfolio) doesn't lose wallet state.
 */

import { useState, useCallback, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AztecAccount {
  index: number;
  alias: string;
  address: string;
  isAdmin: boolean;
  isGenerated?: boolean;
}

export type WalletStatus = "idle" | "loading" | "selected" | "error";

export interface WalletState {
  status: WalletStatus;
  accounts: AztecAccount[];
  activeAccount: AztecAccount | null;
  error: string | null;
}

const INITIAL: WalletState = {
  status: "idle",
  accounts: [],
  activeAccount: null,
  error: null,
};

const STORAGE_KEY = "fs_active_account_index";
const GENERATED_STORAGE_KEY = "fs_generated_accounts";

function parseGeneratedAccounts(raw: string | null): AztecAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const maybe = item as Partial<AztecAccount>;
        if (
          typeof maybe.index !== "number" ||
          typeof maybe.alias !== "string" ||
          typeof maybe.address !== "string"
        ) {
          return null;
        }
        return {
          index: maybe.index,
          alias: maybe.alias,
          address: maybe.address,
          isAdmin: false,
          isGenerated: true,
        } as AztecAccount;
      })
      .filter((v): v is AztecAccount => v !== null);
  } catch {
    return [];
  }
}

function loadGeneratedAccounts(): AztecAccount[] {
  if (typeof window === "undefined") return [];
  return parseGeneratedAccounts(localStorage.getItem(GENERATED_STORAGE_KEY));
}

function saveGeneratedAccounts(accounts: AztecAccount[]): void {
  if (typeof window === "undefined") return;
  const generated = accounts
    .filter((a) => a.isGenerated)
    .map((a) => ({
      index: a.index,
      alias: a.alias,
      address: a.address,
      isAdmin: false,
      isGenerated: true,
    }));
  localStorage.setItem(GENERATED_STORAGE_KEY, JSON.stringify(generated));
}

function mergeAccounts(base: AztecAccount[], generated: AztecAccount[]): AztecAccount[] {
  const seen = new Set<number>();
  const out: AztecAccount[] = [];
  for (const acc of [...base, ...generated]) {
    if (seen.has(acc.index)) continue;
    seen.add(acc.index);
    out.push(acc);
  }
  return out.sort((a, b) => a.index - b.index);
}

// Generated account indices live at 1000+. Next free index given current accounts.
function nextGeneratedIndex(accounts: AztecAccount[]): number {
  const max = accounts.reduce((m, acc) => {
    if (!acc.isGenerated || acc.index < 1000) return m;
    return Math.max(m, acc.index);
  }, 999);
  return max + 1;
}

// In live mode the server is the source of truth for generated accounts (they
// live in its in-memory wallet and are returned by /api/accounts). Drop any
// stale localStorage entries the server no longer knows — e.g. after a server
// restart — so we never select a non-existent account. In sim mode there is no
// server-side account list, so client-side generated accounts are kept as-is.
function reconcileGenerated(
  serverAccounts: AztecAccount[],
  source: string | undefined
): AztecAccount[] {
  const generated = loadGeneratedAccounts();
  if (source !== "live") return generated;
  const serverIdx = new Set(serverAccounts.map((a) => a.index));
  return generated.filter((g) => serverIdx.has(g.index));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAztecWallet() {
  const [state, setState] = useState<WalletState>(INITIAL);

  // On mount: load accounts and restore previously selected account from localStorage
  useEffect(() => {
    const savedIndex =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const idx = savedIndex !== null ? parseInt(savedIndex, 10) : null;

    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: { accounts: AztecAccount[]; source?: string }) => {
        const serverAccounts = data.accounts ?? [];
        const accounts = mergeAccounts(serverAccounts, reconcileGenerated(serverAccounts, data.source));

        // Restore saved account or stay idle
        if (idx !== null) {
          const account = accounts.find((a) => a.index === idx) ?? accounts[0] ?? null;
          setState({
            status: account ? "selected" : "idle",
            accounts,
            activeAccount: account,
            error: null,
          });
        } else {
          setState((s) => ({ ...s, accounts }));
        }
      })
      .catch((e) => {
        // Server unreachable: fall back to whatever generated accounts the
        // browser has cached (sim/offline only — these can't transact live).
        const accounts = loadGeneratedAccounts();
        setState({
          status: accounts.length > 0 ? "selected" : "error",
          accounts,
          activeAccount: accounts[0] ?? null,
          error: String(e),
        });
      });
  }, []);

  // Persist activeAccount index whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.activeAccount !== null) {
      localStorage.setItem(STORAGE_KEY, String(state.activeAccount.index));
    } else if (state.status === "idle") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.activeAccount, state.status]);

  /**
   * "Connect" = select a test account to act as.
   * accountIndex maps to the selected account index in the dropdown.
   */
  const connect = useCallback(async (accountIndex = 0) => {
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const res = await fetch("/api/accounts");
      const data: { accounts: AztecAccount[]; source?: string } = await res.json();
      const serverAccounts = data.accounts ?? [];
      const merged = mergeAccounts(serverAccounts, reconcileGenerated(serverAccounts, data.source));
      const account =
        merged.find((a) => a.index === accountIndex) ??
        merged[0] ??
        null;

      setState({
        status: account ? "selected" : "error",
        accounts: merged,
        activeAccount: account,
        error: account ? null : "No accounts available",
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "error",
        error: e instanceof Error ? e.message : "Failed to load accounts",
      }));
    }
  }, []);

  /** Switch active account without re-fetching. */
  const switchAccount = useCallback((index: number) => {
    setState((s) => {
      const account = s.accounts.find((a) => a.index === index) ?? null;
      if (account && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(index));
      }
      return {
        ...s,
        status: account ? "selected" : s.status,
        activeAccount: account,
      };
    });
  }, []);

  /** Deselect / disconnect. */
  const disconnect = useCallback(async () => {
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    setState((s) => ({ ...s, status: "idle", activeAccount: null }));
  }, []);

  // Create a new account. In LIVE mode this deploys a REAL, fee-sponsored account
  // server-side (so it can verify KYC, deposit, vote, trade); in SIM mode the
  // route returns a phantom address the in-memory sim store accepts. Either way
  // the server is authoritative for the address; the client assigns the index in
  // sim. Surfaces an error instead of silently creating a non-functional account.
  const generateDevAccount = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const res = await fetch("/api/accounts/create", { method: "POST" });
      const data = (await res.json()) as {
        index?: number;
        address?: string;
        alias?: string;
        error?: string;
      };
      if (!res.ok || !data.address) {
        setState((s) => ({
          ...s,
          status: s.activeAccount ? "selected" : "idle",
          error: data.error ?? "Could not create account.",
        }));
        return;
      }
      setState((s) => {
        const index =
          typeof data.index === "number" ? data.index : nextGeneratedIndex(s.accounts);
        const next: AztecAccount = {
          index,
          alias: data.alias ?? `dev-${index}`,
          address: data.address as string,
          isAdmin: false,
          isGenerated: true,
        };
        const accounts = mergeAccounts(s.accounts, [next]);
        saveGeneratedAccounts(accounts);
        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, String(index));
        return { ...s, status: "selected", accounts, activeAccount: next, error: null };
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        status: s.activeAccount ? "selected" : "idle",
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  return {
    ...state,
    connect,
    switchAccount,
    disconnect,
    generateDevAccount,
    isConnected: state.status === "selected" && state.activeAccount !== null,
    isConnecting: state.status === "loading",
  };
}
