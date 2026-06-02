"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_ITEMS, findRoute } from "@/lib/nav";
import HeaderWalletButton from "@/components/HeaderWalletButton";
import RuntimeModeChip from "@/components/RuntimeModeChip";
import Brand from "./Brand";
import MoreMenu from "./MoreMenu";
import TrustChip from "./TrustChip";
import { useShell } from "./ShellProvider";

function PrimaryTabs({ activeHref }: { activeHref?: string }) {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {PRIMARY_ITEMS.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : "false"}
            className="topnav-tab"
            style={{ touchAction: "manipulation" }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact horizontal scroll strip of primary tabs (drawer covers the rest). */
function MobileTabStrip({ activeHref }: { activeHref?: string }) {
  return (
    <nav
      aria-label="Primary"
      className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border bg-card/60 px-4 py-2 backdrop-blur lg:hidden"
    >
      {PRIMARY_ITEMS.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : "false"}
            className="route-chip"
            style={{ touchAction: "manipulation" }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The app's only persistent chrome: a single calm top bar. Brand + primary
 * tabs on the left; trust chip, runtime mode, and wallet on the right. On
 * mobile the tabs drop to a scroll strip and a hamburger opens the drawer.
 */
export default function TopBar() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);
  const { setDrawerOpen } = useShell();

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 lg:gap-3 lg:px-8">
          {/* Mobile menu button */}
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="btn btn-ghost btn-sm min-h-11 min-w-11 lg:hidden"
            style={{ touchAction: "manipulation" }}
          >
            <span aria-hidden="true" className="text-lg leading-none">☰</span>
          </button>

          <Brand />

          <PrimaryTabs activeHref={active?.href} />
          <div className="hidden lg:block">
            <MoreMenu />
          </div>

          <span className="flex-1" />

          <TrustChip />
          <div className="hidden xl:block">
            <RuntimeModeChip withHint hintAlign="right" />
          </div>
          <HeaderWalletButton />
        </div>
      </header>

      <MobileTabStrip activeHref={active?.href} />
    </>
  );
}
