"use client";

/**
 * useAztecWallet — React hook for browser-side Aztec wallet.
 *
 * Uses BrowserEmbeddedWallet (WASM-based) from @aztec/wallets/embedded.
 * The "browser" export resolves automatically in Next.js client components —
 * no NAPI binaries, no worker threads, fully browser-safe.
 *
 * IMPORTANT: This file must only be imported by 'use client' components.
 * Never import this in API routes or server components.
 */

import { useState, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AztecAccount {
  index: number;
  alias: string;
  address: string;
}

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface WalletState {
  status: WalletStatus;
  accounts: AztecAccount[];
  activeAccount: AztecAccount | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any | null;
  error: string | null;
}

const INITIAL_STATE: WalletState = {
  status: "disconnected",
  accounts: [],
  activeAccount: null,
  wallet: null,
  error: null,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAztecWallet() {
  const [state, setState] = useState<WalletState>(INITIAL_STATE);
  const walletRef = useRef<unknown>(null);

  /**
   * Connect: create BrowserEmbeddedWallet, import test accounts, set active.
   * accountIndex — which test account to make active (0, 1, or 2)
   */
  const connect = useCallback(async (accountIndex = 0) => {
    setState((s) => ({ ...s, status: "connecting", error: null }));

    try {
      const pxeUrl =
        process.env.NEXT_PUBLIC_AZTEC_PXE_URL ?? "http://localhost:8080";

      // ── 1. Create BrowserEmbeddedWallet (WASM PXE, no NAPI) ────────────
      // Dynamic import so webpack bundles with the "browser" export condition.
      const { EmbeddedWallet } = await import("@aztec/wallets/embedded");
      const wallet = await EmbeddedWallet.create(pxeUrl, {
        ephemeral: true, // in-memory; change to false for persistent IndexedDB
      });

      // ── 2. Import test account key material ────────────────────────────
      const {
        INITIAL_TEST_SECRET_KEYS,
        INITIAL_TEST_SIGNING_KEYS,
        INITIAL_TEST_ACCOUNT_SALTS,
      } = await import("@aztec/accounts/testing");

      // ── 3. Register all 3 test accounts ───────────────────────────────
      const accounts: AztecAccount[] = [];
      for (let i = 0; i < 3; i++) {
        const secretKey = INITIAL_TEST_SECRET_KEYS[i];
        const salt = INITIAL_TEST_ACCOUNT_SALTS[i];
        const signingKey = INITIAL_TEST_SIGNING_KEYS[i];

        const manager = await wallet.createSchnorrAccount(
          secretKey,
          salt,
          signingKey,
          `test${i}`
        );

        const complete = await manager.getCompleteAddress();
        accounts.push({
          index: i,
          alias: `test${i}`,
          address: complete.address.toString(),
        });
      }

      // ── 4. Register contract addresses from env ────────────────────────
      // So the wallet can decode notes from these contracts.
      try {
        const { AztecAddress } = await import("@aztec/aztec.js/addresses");
        const contractAddresses = {
          kycVerifier: process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS,
          fundToken: process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS,
          defiVault: process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS,
          housingFund: process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS,
          governance: process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS,
        };

        for (const [, addr] of Object.entries(contractAddresses)) {
          if (addr && addr !== "DEPLOY_FAILED" && addr.startsWith("0x")) {
            // Register as a known contract so the PXE can track notes
            await wallet.registerSender(AztecAddress.fromString(addr), "");
          }
        }
      } catch {
        // Non-fatal — contract registration is optional for reads
      }

      walletRef.current = wallet;

      setState({
        status: "connected",
        accounts,
        activeAccount: accounts[accountIndex] ?? accounts[0] ?? null,
        wallet,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet";
      console.error("[useAztecWallet] connect failed:", err);
      setState({
        ...INITIAL_STATE,
        status: "error",
        error: message,
      });
    }
  }, []);

  /**
   * Switch the active account without reconnecting.
   */
  const switchAccount = useCallback((index: number) => {
    setState((s) => {
      const account = s.accounts.find((a) => a.index === index) ?? null;
      return { ...s, activeAccount: account };
    });
  }, []);

  /**
   * Disconnect and clear all wallet state.
   */
  const disconnect = useCallback(async () => {
    if (walletRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (walletRef.current as any).stop?.();
      } catch {
        /* ignore */
      }
      walletRef.current = null;
    }
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    connect,
    switchAccount,
    disconnect,
    isConnected: state.status === "connected",
    isConnecting: state.status === "connecting",
  };
}
