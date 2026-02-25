"use client";

/**
 * WalletContext — single source of truth for Aztec wallet state.
 *
 * Wrap the app once (in layout.tsx via <WalletProvider>).
 * Any component reads state with useWallet() — no prop-drilling,
 * no re-instantiation on navigation, no duplicate buttons.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useAztecWallet, type WalletState } from "@/hooks/useAztecWallet";

// ── Context shape ─────────────────────────────────────────────────────────────

interface WalletContextValue extends WalletState {
  connect: (accountIndex?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: (index: number) => void;
  isConnected: boolean;   // true when activeAccount is set
  isConnecting: boolean;  // true while loading accounts
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useAztecWallet();

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
}
