"use client";

import Link from "next/link";
import { useState } from "react";
import { registerKYC } from "@/lib/contracts";
import { ActionBar, Alert, Button } from "@/components/ui";

const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
  process.env.NEXT_PUBLIC_SIMULATION === "true";

type VerifyPhase = "idle" | "requesting" | "waiting" | "registering";

// User-facing status for each step of the flow. Empty for "idle" (the Start
// button speaks for itself); the raw phase name stays in the dev-only readout.
const PHASE_STATUS: Record<VerifyPhase, string> = {
  idle: "",
  requesting: "Preparing your verification…",
  waiting: "Waiting for your proof — complete it in your identity app, then return here.",
  registering: "Recording your verified status privately…",
};

interface KYCFlowProps {
  userAddress: string;
  isVerified: boolean;
  isInvestor?: boolean;
  onVerified: () => void;
}

export default function KYCFlow({ userAddress, isVerified, isInvestor, onVerified }: KYCFlowProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<VerifyPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const completeRegistration = async (devMode = false) => {
    setPhase("registering");
    const result = await registerKYC(userAddress, devMode);
    if (!result.success) {
      throw new Error(result.error ?? "KYC registration failed");
    }
    onVerified();
  };

  const startVerification = async () => {
    setLoading(true);
    setError(null);
    setPhase("requesting");

    try {
      const res = await fetch("/api/zkpassport/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start verification");
      }

      setQrUrl(data.qrUrl ?? null);

      if (data.devMode || String(data.qrUrl ?? "").startsWith("dev://")) {
        await completeRegistration(true);
        return;
      }

      setPhase("waiting");

      let attempts = 0;
      const maxAttempts = 100;
      const interval = setInterval(async () => {
        attempts += 1;

        try {
          const statusRes = await fetch(`/api/zkpassport/status?requestId=${encodeURIComponent(data.requestId ?? "")}`);
          const statusData = await statusRes.json();
          if (!statusRes.ok) {
            throw new Error(statusData.error ?? "Could not confirm zkPassport status.");
          }

          if (statusData.verified) {
            clearInterval(interval);
            await completeRegistration(false);
            setLoading(false);
            return;
          }

          if (attempts >= maxAttempts) {
            clearInterval(interval);
            setLoading(false);
            setPhase("idle");
            setError("Verification is still pending. Please try again.");
          }
        } catch (statusError: unknown) {
          clearInterval(interval);
          setLoading(false);
          setPhase("idle");
          setError(statusError instanceof Error ? statusError.message : "Could not confirm zkPassport status.");
        }
      }, 3000);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to start verification");
      setPhase("idle");
      setLoading(false);
    }
  };

  const handleDevSkip = async () => {
    setLoading(true);
    setError(null);

    try {
      await completeRegistration(true);
    } catch (skipError: unknown) {
      setError(skipError instanceof Error ? skipError.message : "Dev skip failed");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  if (isVerified) {
    return (
      <Alert tone="success" title="You are verified">
        <div className="space-y-3">
          <p>Status: {isInvestor ? "Investor" : "Verified"}</p>
          <Link href="/invest" className="btn btn-primary btn-sm">
            Go to Invest
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-2 text-body text-text-2">
        <li>1. Start the request.</li>
        <li>2. Approve in zkPassport.</li>
        <li>3. Return here and continue to Invest.</li>
      </ol>

      {qrUrl && (
        <div className="surface-muted p-3">
          <p className="text-label text-text-3">Request link</p>
          <p className="text-mono mt-1 break-all text-text-2">{qrUrl}</p>
        </div>
      )}

      <ActionBar align="start">
        <Button onClick={startVerification} loading={loading} disabled={loading}>
          Start verification
        </Button>

        {DEV_MODE ? (
          <Button variant="secondary" onClick={handleDevSkip} disabled={loading}>
            Dev skip
          </Button>
        ) : PHASE_STATUS[phase] ? (
          <span className="text-caption text-text-3" aria-live="polite">
            {PHASE_STATUS[phase]}
          </span>
        ) : null}
      </ActionBar>

      {DEV_MODE && (
        <p className="text-caption text-text-3" aria-live="polite">
          Phase: {phase}
        </p>
      )}

      {error && (
        <Alert tone="danger" title="Verification could not continue">
          {error}
        </Alert>
      )}
    </div>
  );
}
