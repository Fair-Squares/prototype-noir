"use client";

import { useState } from "react";
import { Alert, Button, StatusChip } from "@/components/ui";
import { formatEUR, requestTestEur } from "@/lib/contracts";

export interface FaucetPanelProps {
  /** Active account address; null when not connected. */
  address: string | null;
  /** Active account index for the faucet POST. */
  accountIndex: number;
  /** Amount of test EUR minted per request. */
  amount: number;
  /** Called after a successful drip so the parent can refresh balances. */
  onFunded: () => Promise<void> | void;
}

type FaucetMsg = { tone: "success" | "danger"; text: string };

/**
 * Test-only EUR faucet. Mints test EUR to the connected account via the on-chain
 * Dripper (AIP-20). Clearly marked as a simulation tool so it is never confused
 * with a real funding rail. Preserves the requestTestEur POST wiring.
 */
export function FaucetPanel({ address, accountIndex, amount, onFunded }: FaucetPanelProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<FaucetMsg | null>(null);

  const handleFaucet = async () => {
    if (!address) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await requestTestEur(address, amount, accountIndex);
      if (!result.success) {
        setMsg({ tone: "danger", text: result.error ?? "Faucet request failed." });
        return;
      }
      setMsg({
        tone: "success",
        text: result.message ?? `Added ${formatEUR(amount)} of test EUR to your account.`,
      });
      await onFunded();
    } catch (e: unknown) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Faucet request failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-fs-magenta/40 p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-label">Test EUR faucet</span>
            <StatusChip status="simulation" label="Test only — not real money" />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFaucet}
            disabled={!address}
            loading={busy}
          >
            {busy ? "Adding…" : `Add ${formatEUR(amount)}`}
          </Button>
        </div>
        <p className="text-caption text-text-2">
          Mints simulated EUR to your account through the on-chain Dripper. This
          is a development tool for trying the flow, not a real deposit of funds.
        </p>
        {!address ? (
          <p className="text-caption text-text-3">
            Connect your account to use the faucet.
          </p>
        ) : null}
        <div aria-live="polite">
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        </div>
      </div>
    </div>
  );
}
