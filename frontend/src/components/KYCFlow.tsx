"use client";

import { useState } from "react";
import InfoTooltip from "@/components/InfoTooltip";
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
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "requesting" | "waiting" | "registering">("idle");

  const completeRegistration = async (dev = false) => {
    setPhase("registering");
    const result = await registerKYC(userAddress, dev);
    if (!result.success) {
      throw new Error(result.error ?? "KYC registration failed");
    }
    onVerified();
  };

  const startVerification = async () => {
    setLoading(true);
    setError(null);
    setPhase("requesting");
    let keepLoading = false;

    try {
      const res = await fetch("/api/zkpassport/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start verification");

      setQrUrl(data.qrUrl ?? null);

      // Deterministic dev bypass for both simulation and live-dev runs.
      if (data.devMode || String(data.qrUrl ?? "").startsWith("dev://")) {
        await completeRegistration(true);
        return;
      }

      setPhase("waiting");
      keepLoading = true;

      let attempts = 0;
      const maxAttempts = 100;
      const interval = setInterval(async () => {
        attempts += 1;
        try {
          const statusRes = await fetch(`/api/zkpassport/status?requestId=${encodeURIComponent(data.requestId ?? "")}`);
          const statusData = await statusRes.json();

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
            setError("Verification is still pending. In local dev, enable NEXT_PUBLIC_DEV_MODE=true for deterministic testing.");
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            setLoading(false);
            setPhase("idle");
            setError("Could not confirm zkPassport status.");
          }
        }
      }, 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    } finally {
      if (!keepLoading) {
        setLoading(false);
      }
    }
  };

  const handleDevSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      await completeRegistration(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  if (isVerified) {
    return (
      <div className="rounded-2xl border border-fs-teal/20 bg-fs-mint/60 p-8 text-center">
        <h3 className="text-xl font-semibold text-fs-teal-dark">KYC verified</h3>
        <p className="text-sm text-fs-teal-dark/80 mt-2">
          Investor role granted for this wallet address.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-fs-teal-dark">
          Role: {isInvestor ? "Investor" : "Verified"}
        </p>
        <a
          href="/invest"
          className="inline-flex mt-5 px-5 py-2.5 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark"
        >
          Continue to Invest
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-1">Identity verification</h2>
        <p className="text-sm text-text-2 mt-1">
          Verify privately with zkPassport to unlock investor actions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          ["1", "Open verification", "Start a zkPassport request linked to your wallet."],
          ["2", "Prove eligibility", "Your phone generates a zero-knowledge proof."],
          ["3", "Role activation", "The protocol grants your investor role on success."],
        ].map(([step, title, desc]) => (
          <div key={step} className="rounded-xl border border-border bg-bg p-4">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fs-mint text-xs font-bold text-fs-teal-dark">{step}</span>
            <p className="text-sm font-semibold mt-2">{title}</p>
            <p className="text-xs text-text-3 mt-1 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {qrUrl && (
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs text-text-3 mb-2 uppercase tracking-wide">Verification request</p>
          <div className="rounded-lg bg-white border border-border p-3 text-xs font-mono text-text-2 break-all">
            {qrUrl}
          </div>
          <p className="text-xs text-text-3 mt-2">
            In production, render this as a QR and scan with the zkPassport app.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={startVerification}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark disabled:opacity-50"
        >
          {loading ? "Working..." : "Start zkPassport"}
        </button>

        {DEV_MODE && (
          <button
            onClick={handleDevSkip}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg border border-border text-sm font-semibold text-text-2 hover:bg-bg disabled:opacity-50"
          >
            Dev skip
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-bg p-4 text-xs text-text-2 space-y-1">
        <p className="inline-flex items-center gap-1.5">
          Privacy model
          <InfoTooltip text="Only proof validity and role state are recorded. Identity document details stay off-chain." />
        </p>
        <p>
          The protocol stores role state only (`verified`, `investor`). Personal passport data is not written on-chain.
        </p>
        {phase !== "idle" && <p className="text-text-3">Current phase: {phase}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
