"use client";

import { useState } from "react";
import { ActionBar, Alert, Button, StatusChip } from "@/components/ui";
import { formatEUR, requestTestEur } from "@/lib/contracts";

const FAUCET_AMOUNT = 50_000;

export interface FaucetPanelProps {
  address: string;
  accountIndex: number;
  /** Called after a successful drip so the page can refresh balances. */
  onDripped: () => void | Promise<void>;
}

/**
 * Test-only EUR faucet. Renders bare (no card) so the page can tuck it inside a
 * "Demo tools" disclosure; still marked with a "Test only" chip so it never
 * reads as a real funding source. Uses the real requestTestEur (Dripper, AIP-20).
 */
export function FaucetPanel({ address, accountIndex, onDripped }: FaucetPanelProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const handleFaucet = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await requestTestEur(address, FAUCET_AMOUNT, accountIndex);
      if (!res.success) {
        setResult({ tone: "danger", text: res.error ?? "Faucet failed." });
        return;
      }
      setResult({ tone: "success", text: res.message ?? `Dripped ${formatEUR(FAUCET_AMOUNT)}.` });
      await onDripped();
    } catch (e: unknown) {
      setResult({ tone: "danger", text: e instanceof Error ? e.message : "Faucet failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="text-caption max-w-md text-text-2">
          Mint test EURs to your account via the on-chain Dripper (AIP-20). For the
          demo only — these are not real funds.
        </p>
        <StatusChip status="simulation" label="Test only" />
      </div>
      <div aria-live="polite" className="mb-3">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      </div>
      <ActionBar align="start">
        <Button variant="secondary" onClick={handleFaucet} loading={busy}>
          {busy ? "Dripping…" : `Get ${formatEUR(FAUCET_AMOUNT)}`}
        </Button>
      </ActionBar>
    </div>
  );
}
