"use client";

import { createContext, use, useState, type ReactNode } from "react";

interface ShellState {
  /** Mobile slide-over nav drawer. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Desktop "More" disclosure menu. */
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  /** Trust & privacy summary popover / sheet. */
  trustOpen: boolean;
  setTrustOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellState | null>(null);

/**
 * Lifts the shell's transient open/close state so the top bar, More menu,
 * trust chip, and mobile drawer can all read and toggle it without prop
 * drilling. Read with the `useShell` hook (React 19 `use`).
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);

  return (
    <ShellContext.Provider
      value={{ drawerOpen, setDrawerOpen, moreOpen, setMoreOpen, trustOpen, setTrustOpen }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const ctx = use(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}
