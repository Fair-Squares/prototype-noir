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
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fs-teal/10 border border-fs-teal/20">
        <div className="w-2 h-2 rounded-full bg-fs-teal" />
        <span className="text-xs text-fs-teal font-mono font-medium">
          {address.slice(0, 8)}...{address.slice(-6)}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => accounts.length > 1 ? setShowPicker(!showPicker) : connect()}
        disabled={loading || accounts.length === 0}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fs-teal to-fs-teal-dark hover:from-fs-teal-light hover:to-fs-teal text-white text-sm font-semibold disabled:opacity-40 shadow-lg shadow-fs-teal/20 transition-all"
      >
        {loading ? "Connecting..." : accounts.length === 0 ? "No accounts" : "Connect Wallet"}
      </button>

      {showPicker && accounts.length > 1 && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface-card border border-surface-border rounded-xl shadow-2xl z-50 py-2">
          <p className="px-3 py-1.5 text-xs text-text-muted font-medium">Select account</p>
          {accounts.map((acc, i) => (
            <button
              key={acc}
              onClick={() => connect(acc)}
              className="w-full px-3 py-2.5 text-left hover:bg-surface-hover text-sm font-mono text-text-secondary"
            >
              Account #{i + 1}: {acc.slice(0, 10)}...{acc.slice(-8)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
