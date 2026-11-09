"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { MORE_ACCOUNT_ITEMS, MORE_REFERENCE_ITEMS, findRoute, isMoreActive } from "@/lib/nav";
import { useShell } from "./ShellProvider";

/** Preload a route bundle on hover/focus to cut perceived latency. */
function preload(href: string) {
  // App Router prefetches via <Link>; this is a no-op hook point kept explicit.
  void href;
}

/**
 * "More" disclosure menu (desktop). Holds the occasional account tasks (Trade,
 * Verification, Rewards) and, below a divider, Reference + How it works. The
 * trigger lights up when the active route lives inside the menu so the user is
 * never lost.
 */
export default function MoreMenu() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);
  const moreActive = isMoreActive(pathname);
  const { moreOpen, setMoreOpen } = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen, setMoreOpen]);

  return (
    <div className="relative" ref={ref} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMoreOpen(false);
    }}>
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={moreOpen}
        aria-controls={id}
        data-active={moreActive ? "true" : "false"}
        onClick={() => setMoreOpen(!moreOpen)}
        className="topnav-tab"
        style={{ touchAction: "manipulation" }}
      >
        More
        <span aria-hidden="true" className="ml-1 opacity-60">
          ▾
        </span>
      </button>

      {moreOpen ? (
        <nav
          id={id}
          aria-label="More navigation"
          className="surface absolute right-0 z-50 mt-2 w-56 p-2 shadow-sm"
        >
          {MORE_ACCOUNT_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active?.href === item.href ? "page" : undefined}
              data-active={active?.href === item.href ? "true" : "false"}
              onClick={() => setMoreOpen(false)}
              onMouseEnter={() => preload(item.href)}
              onFocus={() => preload(item.href)}
              className="menu-row"
            >
              {item.label}
            </Link>
          ))}
          <div className="my-2 border-t border-border" role="separator" />
          <p className="text-label px-3 pb-1">Reference</p>
          {MORE_REFERENCE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active?.href === item.href ? "page" : undefined}
              data-active={active?.href === item.href ? "true" : "false"}
              onClick={() => setMoreOpen(false)}
              onMouseEnter={() => preload(item.href)}
              onFocus={() => preload(item.href)}
              className="menu-row"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
