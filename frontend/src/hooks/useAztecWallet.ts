"use client";

/**
 * useAztecWallet — lightweight test account selector for the devnet prototype.
 *
 * No BrowserEmbeddedWallet. No WASM. No Web Workers.
 *
 * The devnet has 3 pre-deployed test accounts whose addresses and keys are
 * known from bootstrap. The server can sign transactions on their behalf.
 * In the browser we just track which account the user is "acting as".
 *
 * When a real browser wallet (Obsidian, MetaMask Snaps, etc.) is ready,
 * replace connect() with actual wallet connection logic.
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAztecWallet() {
  const [state, setState] = useState<WalletState>(INITIAL);

  // Load available accounts once on mount
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: { accounts: AztecAccount[] }) => {
        setState((s) => ({ ...s, accounts: data.accounts }));
      })
      .catch((e) => {
        setState((s) => ({ ...s, error: String(e) }));
      });
  }, []);

  /**
   * "Connect" = select a test account to act as.
   * accountIndex: 0 = admin/test0, 1 = test1, 2 = test2
   */
  const connect = useCallback(
    async (accountIndex = 0) => {
      setState((s) => ({ ...s, status: "loading", error: null }));

      try {
        // Fetch if not loaded yet
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
    },
    []
  );

  /** Switch active account without re-fetching. */
  const switchAccount = useCallback((index: number) => {
    setState((s) => {
      const account = s.accounts.find((a) => a.index === index) ?? null;
      return {
        ...s,
        status: account ? "selected" : s.status,
        activeAccount: account,
      };
    });
  }, []);

  /** Deselect / disconnect. */
  const disconnect = useCallback(async () => {
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
