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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card text-xs text-text-2 font-mono">
        <span className="w-2 h-2 rounded-full bg-fs-teal" />
        {address.slice(0, 8)}...{address.slice(-6)}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => accounts.length > 1 ? setShowPicker(!showPicker) : connect()}
        disabled={loading || accounts.length === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-teal text-white text-[13px] font-semibold hover:bg-fs-teal-dark disabled:opacity-40"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
        </svg>
        {loading ? "Connecting..." : "Connect Wallet"}
      </button>

      {showPicker && accounts.length > 1 && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-xl shadow-xl z-50 py-2">
          <p className="px-3 py-1 text-xs text-text-3 font-medium">Pick an account</p>
          {accounts.map((acc, i) => (
            <button
              key={acc}
              onClick={() => connect(acc)}
              className="w-full px-3 py-2 text-left hover:bg-card-hover text-sm font-mono text-text-2"
            >
              Account {i + 1}: {acc.slice(0, 10)}...{acc.slice(-8)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
