"use client";

import { useEffect, useRef, useState } from "react";

export interface CopyButtonProps {
  /** Full value copied to the clipboard. */
  value: string;
  /** Accessible label, e.g. "Copy KYC Verifier address". */
  label: string;
  className?: string;
}

/**
 * Icon-only copy control. Copies `value`, flips to a short "Copied" state for
 * ~1.5s, and announces the result via aria-live. Carries an aria-label because
 * it has no visible text in the idle state.
 */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — leave the value visible
      // for manual selection rather than masking the failure.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? `${label} — copied` : label}
      className={`btn btn-ghost btn-sm ${className ?? ""}`}
    >
      <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
