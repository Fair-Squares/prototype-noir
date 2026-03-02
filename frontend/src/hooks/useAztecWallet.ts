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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAztecWallet() {
  const [state, setState] = useState<WalletState>(INITIAL);

  // On mount: load accounts and restore previously selected account from localStorage
  useEffect(() => {
    const savedIndex =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const idx = savedIndex !== null ? parseInt(savedIndex, 10) : null;
    const generated = loadGeneratedAccounts();

    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: { accounts: AztecAccount[] }) => {
        const accounts = mergeAccounts(data.accounts ?? [], generated);

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
        const accounts = generated;
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
      const data: { accounts: AztecAccount[] } = await res.json();
      const merged = mergeAccounts(data.accounts ?? [], loadGeneratedAccounts());
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

  const generateDevAccount = useCallback(() => {
    if (typeof window === "undefined") return;

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const address = `0x${toHex(bytes)}`;

    setState((s) => {
      const maxGeneratedIndex = s.accounts.reduce((max, acc) => {
        if (!acc.isGenerated || acc.index < 1000) return max;
        return Math.max(max, acc.index);
      }, 999);
      const index = maxGeneratedIndex + 1;
      const next: AztecAccount = {
        index,
        alias: `dev-${index}`,
        address,
        isAdmin: false,
        isGenerated: true,
      };
      const accounts = mergeAccounts(s.accounts, [next]);
      saveGeneratedAccounts(accounts);
      localStorage.setItem(STORAGE_KEY, String(next.index));
      return {
        ...s,
        status: "selected",
        accounts,
        activeAccount: next,
        error: null,
      };
    });
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
