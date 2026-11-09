"use client";

import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useSessionActivity } from "@/lib/sessionActivity";

/**
 * "This session" activity list (UX overhaul §4.2 / D5): the actions performed
 * through this app in the current browser session, newest first. Paired with
 * an honest note about the historical gap — the protocol exposes no
 * per-account event feed (private actions are unattributed on-chain by
 * design), so balances above are the source of truth.
 */
export function ActivityLog({ address }: { address: string }) {
  const entries = useSessionActivity(address);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No activity in this session yet"
        description="Actions you perform here — deposits, claims, withdrawals, orders — appear in this list for the current session. The protocol does not expose a per-account historical feed (private actions are unattributed on-chain by design); your live balances above always reflect on-chain state."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {entries.map((entry, i) => (
          <li key={`${entry.ts}-${i}`} className="flex items-baseline justify-between gap-4 py-2">
            <span className="text-body text-text-1">{entry.label}</span>
            <span className="text-caption shrink-0 tabular-nums text-text-3">
              {formatDateTime(new Date(entry.ts))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption mt-3 text-text-3">
        This session only. The protocol does not expose a per-account historical
        feed — private actions are unattributed on-chain by design.
      </p>
    </div>
  );
}
