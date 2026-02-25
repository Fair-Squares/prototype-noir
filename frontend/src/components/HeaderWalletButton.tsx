"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";

export default function HeaderWalletButton() {
  const { status, activeAccount, accounts, connect, disconnect, switchAccount } =
    useWallet();
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Disconnected ──────────────────────────────────────────────────────────
  if (status === "disconnected" || status === "error") {
    return (
      <button
        onClick={() => connect(0)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-anthracite text-white text-[13px] font-semibold hover:bg-fs-anthracite/90 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
        </svg>
        Connect Wallet
      </button>
    );
  }

  // ── Connecting ────────────────────────────────────────────────────────────
  if (status === "connecting") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-anthracite/60 text-white text-[13px] font-semibold cursor-wait">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Connecting…
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  const short = activeAccount
    ? `${activeAccount.address.slice(0, 6)}…${activeAccount.address.slice(-4)}`
    : "Connected";

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fs-mint border border-fs-teal/20 text-fs-teal-dark text-[13px] font-semibold hover:bg-fs-teal/10 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-fs-teal inline-block" />
        {activeAccount?.alias ?? short}
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {showDropdown && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />

          <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-border shadow-lg z-50 overflow-hidden">
            {/* address */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] text-text-3 font-medium uppercase tracking-wide mb-1">Address</p>
              <p className="text-xs font-mono text-text-2 break-all">
                {activeAccount?.address}
              </p>
            </div>

            {/* account switcher */}
            {accounts.length > 1 && (
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[10px] text-text-3 font-medium uppercase tracking-wide mb-1.5">Switch account</p>
                <div className="space-y-1">
                  {accounts.map((acc) => (
                    <button
                      key={acc.index}
                      onClick={() => { switchAccount(acc.index); setShowDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                        acc.index === activeAccount?.index
                          ? "bg-fs-mint text-fs-teal-dark font-semibold"
                          : "text-text-2 hover:bg-bg"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.index === activeAccount?.index ? "bg-fs-teal" : "bg-gray-300"}`} />
                      {acc.alias}
                      <span className="ml-auto font-mono opacity-50">
                        {acc.address.slice(0, 6)}…{acc.address.slice(-3)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* disconnect */}
            <div className="px-4 py-2">
              <button
                onClick={() => { disconnect(); setShowDropdown(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
                </svg>
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
