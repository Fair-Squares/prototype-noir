"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_ITEMS, findRoute, isMoreActive } from "@/lib/nav";
import { useShell } from "./ShellProvider";

/**
 * Mobile bottom navigation — the app's single mobile primary-nav pattern
 * (replaces the old hamburger + clipped horizontal tab strip). Shows the three
 * primary destinations plus a "More" button that opens the existing drawer for
 * everything else. Desktop uses the top bar instead, so this is `lg:hidden`.
 */
export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const activeHref = findRoute(pathname)?.href;
  const moreActive = isMoreActive(pathname);
  const { drawerOpen, setDrawerOpen } = useShell();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {PRIMARY_ITEMS.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : "false"}
            className="bottomnav-item"
            style={{ touchAction: "manipulation" }}
          >
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-controls="mobile-nav-drawer"
        aria-label="More navigation"
        data-active={moreActive ? "true" : "false"}
        onClick={() => setDrawerOpen(true)}
        className="bottomnav-item"
        style={{ touchAction: "manipulation" }}
      >
        More
      </button>
    </nav>
  );
}
