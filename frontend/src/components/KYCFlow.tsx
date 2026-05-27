"use client";

import Link from "next/link";
import { useState } from "react";
import { registerKYC } from "@/lib/contracts";

const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
  process.env.NEXT_PUBLIC_SIMULATION === "true";

interface KYCFlowProps {
  userAddress: string;
  isVerified: boolean;
  isInvestor?: boolean;
  onVerified: () => void;
}

export default function KYCFlow({ userAddress, isVerified, isInvestor, onVerified }: KYCFlowProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "requesting" | "waiting" | "registering">("idle");
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
      <div className="rounded-md border border-fs-teal/20 bg-fs-mint/60 p-6 text-center">
        <h2 className="text-lg font-semibold text-fs-teal-dark">You are verified</h2>
        <p className="mt-1 text-sm text-fs-teal-dark/80">Status: {isInvestor ? "Investor" : "Verified"}</p>
        <Link
          href="/invest"
          className="mt-4 inline-flex rounded-lg bg-fs-teal px-4 py-2 text-sm font-semibold text-white hover:bg-fs-teal-dark"
        >
          Go to Invest
        </Link>
      </div>
    );
  }

  return (
    <div className="surface p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-1">Verify once, then invest</h2>
        <p className="text-sm text-text-2">This takes just a few steps.</p>
      </div>

      <ol className="space-y-2 text-sm text-text-2">
        <li>1. Start the request.</li>
        <li>2. Approve in zkPassport.</li>
        <li>3. Return here and continue to Invest.</li>
      </ol>

      {qrUrl && (
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-3">Request Link</p>
          <p className="mt-1 break-all text-xs font-mono text-text-2">{qrUrl}</p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={startVerification}
          disabled={loading}
          className="rounded-lg bg-fs-teal px-4 py-2 text-sm font-semibold text-white hover:bg-fs-teal-dark disabled:opacity-50"
        >
          {loading ? "Working..." : "Start Verification"}
        </button>

        {DEV_MODE ? (
          <button
            onClick={handleDevSkip}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-2 hover:bg-bg disabled:opacity-50"
          >
            Dev Skip
          </button>
        ) : (
          <span className="rounded-lg border border-border px-4 py-2 text-center text-sm text-text-3">
            Phase: {phase}
          </span>
        )}
      </div>

      {DEV_MODE && <p className="text-xs text-text-3">Phase: {phase}</p>}

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}
