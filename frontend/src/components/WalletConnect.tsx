"use client";

import { useState, useEffect } from "react";
import { fetchAccounts } from "@/lib/contracts";

interface WalletConnectProps {
  onConnect: (address: string) => void;
}

export default function WalletConnect({ onConnect }: WalletConnectProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts().then(setAccounts);
  }, []);

  const connect = async (selectedAddress?: string) => {
    setLoading(true);
    try {
      const addr = selectedAddress ?? accounts[0];
      if (addr) {
        setAddress(addr);
        onConnect(addr);
        setShowPicker(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (address) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-emerald-700 font-mono font-medium">
          {address.slice(0, 8)}…{address.slice(-6)}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => accounts.length > 1 ? setShowPicker(!showPicker) : connect()}
        disabled={loading || accounts.length === 0}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 shadow-sm"
      >
        {loading
          ? "Connecting…"
          : accounts.length === 0
            ? "No accounts"
            : "Connect Wallet"}
      </button>

      {/* Account picker dropdown */}
      {showPicker && accounts.length > 1 && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2">
          <p className="px-3 py-1 text-xs text-gray-400 font-medium">Select account</p>
          {accounts.map((acc, i) => (
            <button
              key={acc}
              onClick={() => connect(acc)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm font-mono text-gray-700"
            >
              Account #{i + 1}: {acc.slice(0, 10)}…{acc.slice(-8)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
