"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";

export default function HeaderWalletButton() {
  const { status, activeAccount, accounts, connect, disconnect, switchAccount } =
    useWallet();
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fs-anthracite/60 text-white text-[14px] font-semibold cursor-wait">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    );
  }

  // ── No account selected ───────────────────────────────────────────────────
  if (!activeAccount) {
    // If we have accounts loaded, show a picker immediately
    if (accounts.length > 0) {
      return (
        <div className="relative">
          <button
            onClick={() => setShowDropdown((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fs-anthracite text-white text-[14px] font-semibold hover:bg-fs-anthracite/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Select Account
            <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-border shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[12px] text-text-3 font-medium uppercase tracking-wide">
                    Devnet test accounts
                  </p>
                </div>
                {accounts.map((acc) => (
                  <button
                    key={acc.index}
                    onClick={() => { connect(acc.index); setShowDropdown(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg transition-colors border-b border-border last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-fs-mint flex items-center justify-center shrink-0">
                      <span className="text-fs-teal-dark text-[12px] font-bold">{acc.alias[0].toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-1">
                        {acc.alias}
                        {acc.isAdmin && <span className="ml-1.5 text-[11px] font-bold text-fs-teal bg-fs-mint px-1.5 py-0.5 rounded-full">admin</span>}
                      </p>
                      <p className="text-[12px] text-text-3 font-mono truncate">{acc.address.slice(0, 16)}…{acc.address.slice(-6)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }

    // Accounts not loaded yet — show connect button
    return (
      <button
        onClick={() => connect(0)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fs-anthracite text-white text-[14px] font-semibold hover:bg-fs-anthracite/90 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
        </svg>
        Connect
      </button>
    );
  }

  // ── Account selected ──────────────────────────────────────────────────────
  const { address, alias, isAdmin } = activeAccount;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown((v) => !v)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-fs-mint border border-fs-teal/20 text-fs-teal-dark text-[14px] font-semibold hover:bg-fs-teal/10 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-fs-teal inline-block" />
        {alias}
        {isAdmin && (
          <span className="text-[9px] font-bold text-fs-teal bg-white/60 px-1 py-0.5 rounded">admin</span>
        )}
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-border shadow-lg z-50 overflow-hidden">
            {/* Active address */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[12px] text-text-3 font-medium uppercase tracking-wide mb-1">Active address</p>
              <p className="text-[13px] font-mono text-text-2 break-all">{address}</p>
            </div>

            {/* Switch account */}
            {accounts.length > 1 && (
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[12px] text-text-3 font-medium uppercase tracking-wide mb-1.5">Switch account</p>
                <div className="space-y-1">
                  {accounts.map((acc) => (
                    <button
                      key={acc.index}
                      onClick={() => { switchAccount(acc.index); setShowDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                        acc.index === activeAccount.index
                          ? "bg-fs-mint text-fs-teal-dark font-semibold"
                          : "text-text-2 hover:bg-bg"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.index === activeAccount.index ? "bg-fs-teal" : "bg-gray-300"}`} />
                      {acc.alias}
                      <span className="ml-auto font-mono opacity-50">…{acc.address.slice(-6)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Disconnect */}
            <div className="px-4 py-2">
              <button
                onClick={() => { disconnect(); setShowDropdown(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-text-2 hover:bg-bg hover:text-text-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
                </svg>
                Deselect account
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
