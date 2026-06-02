"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { fetchKYCProfile } from "@/lib/contracts";

export default function HeaderWalletButton() {
  const { status, activeAccount, accounts, connect, disconnect, switchAccount, generateDevAccount } =
    useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isInvestor, setIsInvestor] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!activeAccount?.address) {
      setIsInvestor(false);
      return;
    }
    fetchKYCProfile(activeAccount.address)
      .then((profile) => setIsInvestor(Boolean(profile.isInvestor)))
      .catch((e) => console.error("KYC profile read failed", e));
  }, [activeAccount?.address]);

  useEffect(() => {
    if (!showDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showDropdown]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <span className="btn btn-secondary btn-sm min-h-11" data-loading="true" aria-busy="true">
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </span>
    );
  }

  // ── No account selected ───────────────────────────────────────────────────
  if (!activeAccount) {
    if (accounts.length > 0) {
      return (
        <div className="relative" ref={ref}>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={showDropdown}
            aria-haspopup="dialog"
            onClick={() => setShowDropdown((v) => !v)}
            className="btn btn-primary btn-sm min-h-11"
            style={{ touchAction: "manipulation" }}
          >
            Select account
            <span aria-hidden="true" className="opacity-60">
              ▾
            </span>
          </button>

          {showDropdown && (
            <div className="surface absolute right-0 z-50 mt-2 w-64 overflow-hidden p-0 shadow-sm">
              <p className="text-label border-b border-border px-4 py-2.5">Accounts</p>
              {accounts.map((acc) => (
                <button
                  key={acc.index}
                  type="button"
                  onClick={() => {
                    connect(acc.index);
                    setShowDropdown(false);
                  }}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-bg"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fs-mint text-caption font-bold text-fs-teal-dark">
                    {acc.alias[0].toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="text-caption flex items-center gap-1.5 font-semibold text-text-1">
                      {acc.alias}
                      {acc.isAdmin && <span className="chip chip-accent">admin</span>}
                      {acc.isGenerated && <span className="chip chip-warning">dev</span>}
                    </span>
                    <span className="text-mono text-caption block truncate text-text-3">
                      {acc.address.slice(0, 16)}…{acc.address.slice(-6)}
                    </span>
                  </span>
                </button>
              ))}
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => {
                    generateDevAccount();
                    setShowDropdown(false);
                  }}
                  className="btn btn-secondary btn-sm w-full"
                >
                  Generate dev account
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => connect(0)}
        className="btn btn-primary btn-sm min-h-11"
        style={{ touchAction: "manipulation" }}
      >
        Connect
      </button>
    );
  }

  // ── Account selected ──────────────────────────────────────────────────────
  const { address, alias, isAdmin } = activeAccount;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={showDropdown}
        aria-haspopup="dialog"
        onClick={() => setShowDropdown((v) => !v)}
        className="btn btn-secondary btn-sm min-h-11"
        style={{ touchAction: "manipulation" }}
      >
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-fs-teal" />
        <span className="max-w-[7rem] truncate">{alias}</span>
        {isAdmin && <span className="chip chip-accent hidden sm:inline-flex">admin</span>}
        {activeAccount.isGenerated && <span className="chip chip-warning hidden sm:inline-flex">dev</span>}
        {isInvestor && <span className="chip chip-accent hidden sm:inline-flex">investor</span>}
        <span aria-hidden="true" className="opacity-60">
          ▾
        </span>
      </button>

      {showDropdown && (
        <div className="surface absolute right-0 z-50 mt-2 w-64 overflow-hidden p-0 shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-label mb-1">Active address</p>
            <p className="text-mono text-caption break-all text-text-2">{address}</p>
          </div>

          {accounts.length > 1 && (
            <div className="border-b border-border px-4 py-2">
              <p className="text-label mb-1.5">Switch account</p>
              <div className="space-y-1">
                {accounts.map((acc) => (
                  <button
                    key={acc.index}
                    type="button"
                    onClick={() => {
                      switchAccount(acc.index);
                      setShowDropdown(false);
                    }}
                    className={`text-caption flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                      acc.index === activeAccount.index
                        ? "bg-fs-mint font-semibold text-fs-teal-dark"
                        : "text-text-2 hover:bg-bg"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${
                        acc.index === activeAccount.index ? "bg-fs-teal" : "bg-border-strong"
                      }`}
                    />
                    {acc.alias}
                    {acc.isGenerated && <span className="chip chip-warning">dev</span>}
                    <span className="text-mono ml-auto opacity-50">…{acc.address.slice(-6)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => {
                generateDevAccount();
                setShowDropdown(false);
              }}
              className="text-caption w-full rounded-md px-2 py-1.5 text-left text-text-2 transition-colors hover:bg-bg hover:text-text-1"
            >
              Generate dev account
            </button>
          </div>

          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="text-caption w-full rounded-md px-2 py-1.5 text-left text-text-2 transition-colors hover:bg-bg hover:text-text-1"
            >
              Deselect account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
