"use client";

import { useEffect, useState } from "react";

/**
 * Session-local activity log (UX overhaul §4.2, owner decision D5).
 *
 * The protocol deliberately exposes no per-account historical event feed
 * (private actions are unattributed on-chain by design), so /portfolio's
 * history was a permanent dead-end. Smallest honest fix: record the actions
 * the user performs through this app in sessionStorage, labeled "This
 * session". A real per-account feed is a follow-up ticket — this module is
 * frontend-only by design.
 */

export type ActivityKind =
  | "deposit"
  | "withdraw"
  | "rent-withdraw"
  | "rent-reinvest"
  | "payout-claim"
  | "rewards-claim"
  | "order"
  | "vote";

export interface ActivityEntry {
  /** Epoch ms at the time the action completed. */
  ts: number;
  kind: ActivityKind;
  /** Human sentence, already formatted ("Withdrew €1,250 rent"). */
  label: string;
}

const PREFIX = "fs.activity.";
const MAX_ENTRIES = 100;
const listeners = new Set<() => void>();

function storageKey(address: string): string {
  return `${PREFIX}${address}`;
}

export function readActivity(address: string): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(storageKey(address));
  if (!raw) return [];
  return JSON.parse(raw) as ActivityEntry[];
}

/** Record a completed action for this account. Newest first. */
export function logActivity(
  address: string,
  kind: ActivityKind,
  label: string
): void {
  if (typeof window === "undefined") return;
  const next = [{ ts: Date.now(), kind, label }, ...readActivity(address)].slice(
    0,
    MAX_ENTRIES
  );
  window.sessionStorage.setItem(storageKey(address), JSON.stringify(next));
  for (const listener of listeners) listener();
}

/** React hook: the account's session activity, newest first, live-updating. */
export function useSessionActivity(address: string | null): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    if (!address) {
      setEntries([]);
      return;
    }
    const refresh = () => setEntries(readActivity(address));
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [address]);
  return entries;
}
