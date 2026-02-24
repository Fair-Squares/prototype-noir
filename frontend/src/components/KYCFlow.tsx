"use client";

import { useState } from "react";
import { registerKYC } from "@/lib/contracts";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

interface KYCFlowProps {
  userAddress: string;
  isVerified: boolean;
  onVerified: () => void;
}

export default function KYCFlow({ userAddress, isVerified, onVerified }: KYCFlowProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zkpassport/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setQrUrl(data.qrUrl);

      // Poll for result
      const interval = setInterval(async () => {
        const statusRes = await fetch(`/api/zkpassport/status?requestId=${data.requestId}`);
        const statusData = await statusRes.json();
        if (statusData.status === "verified") {
          clearInterval(interval);
          onVerified();
        } else if (statusData.status === "failed") {
          clearInterval(interval);
          setError("Verification failed. Please try again.");
        }
      }, 3000);

      setTimeout(() => clearInterval(interval), 300_000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDevSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await registerKYC(userAddress, true);
      if (result.success) {
        onVerified();
      } else {
        setError(result.error ?? "Dev KYC registration failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (isVerified) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-emerald-700 font-semibold text-xl mb-2">KYC Verified</h3>
        <p className="text-gray-600 mt-2">
          Your identity has been verified. You can now deposit into the housing fund.
        </p>
        <a
          href="/invest"
          className="inline-block mt-5 px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm"
        >
          Start Investing →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Identity Verification</h2>
      <p className="text-sm text-gray-500 mb-6">
        Fair Squares requires KYC verification to comply with regulations.
        Your identity is verified privately — no personal data is stored on-chain.
      </p>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { step: "1", title: "Scan QR Code", desc: "Open the link on your phone", bg: "bg-emerald-50 border-emerald-100" },
          { step: "2", title: "Tap Passport", desc: "NFC reads your passport chip", bg: "bg-teal-50 border-teal-100" },
          { step: "3", title: "ZK Proof", desc: "Proof generated on-device — no data leaves your phone", bg: "bg-cyan-50 border-cyan-100" },
        ].map((s) => (
          <div key={s.step} className={`${s.bg} border rounded-xl p-4 text-center`}>
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center mx-auto mb-2">
              {s.step}
            </div>
            <p className="text-sm text-gray-900 font-medium">{s.title}</p>
            <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* QR Code / Start button */}
      {qrUrl ? (
        <div className="text-center py-4">
          <div className="inline-block bg-white border border-gray-200 p-6 rounded-2xl shadow-sm mb-4">
            <div className="w-48 h-48 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 text-xs font-mono">
              QR: {qrUrl.substring(0, 30)}…
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Scan with your phone and tap your passport…
          </p>
        </div>
      ) : (
        <button
          onClick={startVerification}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 shadow-sm"
        >
          {loading ? "⏳ Starting…" : "🛂 Start Verification with zkPassport"}
        </button>
      )}

      {/* DEV_MODE: skip KYC */}
      {DEV_MODE && (
        <button
          onClick={handleDevSkip}
          disabled={loading}
          className="w-full mt-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50"
        >
          ⚡ Skip KYC (Dev Mode)
        </button>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Privacy explanation */}
      <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-700">
        <p className="font-semibold mb-1">🔒 How privacy works</p>
        <p className="text-emerald-600">
          zkPassport generates a <strong>zero-knowledge proof</strong> on your phone.
          The proof confirms you are 18+ and from an eligible country — without revealing
          your name, date of birth, or passport number. Only a pseudonymous unique identifier
          is stored, so your identity cannot be linked to your wallet address.
        </p>
      </div>
    </div>
  );
}
