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
      .then((data: { accounts: AztecAccount[] }) => {
        const accounts = data.accounts ?? [];

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
        setState((s) => ({ ...s, error: String(e) }));
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
   * accountIndex: 0 = admin/test0, 1 = test1, 2 = test2
   */
  const connect = useCallback(async (accountIndex = 0) => {
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const res = await fetch("/api/accounts");
      const data: { accounts: AztecAccount[] } = await res.json();
      const account =
        data.accounts.find((a) => a.index === accountIndex) ??
        data.accounts[0] ??
        null;

      setState({
        status: account ? "selected" : "error",
        accounts: data.accounts,
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

  return {
    ...state,
    connect,
    switchAccount,
    disconnect,
    isConnected: state.status === "selected" && state.activeAccount !== null,
    isConnecting: state.status === "loading",
  };
}
