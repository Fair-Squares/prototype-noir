"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  PRIMARY_ITEMS,
  MORE_ACCOUNT_ITEMS,
  MORE_REFERENCE_ITEMS,
  findRoute,
  type NavItem,
} from "@/lib/nav";
import RuntimeModeChip from "@/components/RuntimeModeChip";
import { useShell } from "./ShellProvider";

function DrawerLink({
  item,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  activeHref?: string;
  onNavigate: () => void;
}) {
  const isActive = activeHref === item.href;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : "false"}
      onClick={onNavigate}
      className="drawer-row"
      style={{ touchAction: "manipulation" }}
    >
      <span className="block font-semibold">{item.label}</span>
      <span className="block text-meta">{item.blurb}</span>
    </Link>
  );
}

/**
 * Mobile slide-over navigation drawer. Focus is moved into the panel on open
 * and restored to the menu button on close. Scroll is contained, transitions
 * animate transform/opacity only, and motion respects user preference.
 */
export default function MobileDrawer() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);
  const { drawerOpen, setDrawerOpen } = useShell();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;

  const close = () => setDrawerOpen(false);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      {/* Scrim */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-fs-anthracite/40 opacity-100 transition-opacity"
        onClick={close}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-[82%] max-w-sm flex-col border-l border-border bg-card shadow-lg transition-transform"
        style={{
          overscrollBehavior: "contain",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span id="drawer-title" className="font-semibold text-text-1">Fair Squares</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="btn btn-ghost btn-sm min-h-11"
          >
            Close
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4">
            {PRIMARY_ITEMS.map((item) => (
              <DrawerLink key={item.href} item={item} activeHref={active?.href} onNavigate={close} />
            ))}
          </div>

          <p className="text-label px-3 pb-1">More</p>
          <div className="mb-4">
            {MORE_ACCOUNT_ITEMS.map((item) => (
              <DrawerLink key={item.href} item={item} activeHref={active?.href} onNavigate={close} />
            ))}
          </div>

          <p className="text-label px-3 pb-1">Reference</p>
          <div>
            {MORE_REFERENCE_ITEMS.map((item) => (
              <DrawerLink key={item.href} item={item} activeHref={active?.href} onNavigate={close} />
            ))}
          </div>
        </nav>

        <div className="border-t border-border px-5 py-4">
          <RuntimeModeChip />
        </div>
      </div>
    </div>
  );
}
