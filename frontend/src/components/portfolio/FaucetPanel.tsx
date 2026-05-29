"use client";

import { useState } from "react";
import { ActionBar, Alert, Button, Section, StatusChip } from "@/components/ui";
import { formatEUR, requestTestEur } from "@/lib/contracts";

const FAUCET_AMOUNT = 50_000;

export interface FaucetPanelProps {
  address: string;
  accountIndex: number;
  /** Called after a successful drip so the page can refresh balances. */
  onDripped: () => void | Promise<void>;
}

/**
 * Test-only EUR faucet. Marked clearly as a simulation/test tool with a
 * StatusChip so it never reads as a real funding source. Uses the real
 * requestTestEur (on-chain Dripper, AIP-20) wiring.
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
    <Section
      title="Test EUR faucet"
      description="Mint test EURs to your account via the on-chain Dripper (AIP-20)."
      actions={<StatusChip status="simulation" label="Test only" />}
    >
      <div aria-live="polite" className="mb-3">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      </div>
      <ActionBar align="start">
        <Button variant="secondary" onClick={handleFaucet} loading={busy}>
          {busy ? "Dripping…" : `Get ${formatEUR(FAUCET_AMOUNT)}`}
        </Button>
      </ActionBar>
    </Section>
  );
}
