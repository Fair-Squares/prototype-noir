"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_ITEMS, findRoute } from "@/lib/nav";
import HeaderWalletButton from "@/components/HeaderWalletButton";
import RuntimeModeChip from "@/components/RuntimeModeChip";
import Brand from "./Brand";
import MoreMenu from "./MoreMenu";
import TrustChip from "./TrustChip";

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

/**
 * The app's persistent desktop chrome: a single calm top bar. Brand + the three
 * primary tabs + a "More" disclosure on the left; trust chip, runtime mode, and
 * wallet on the right. On mobile the tabs move to the fixed bottom nav
 * (`BottomNav`), so the bar here is just Brand · trust · wallet.
 */
export default function TopBar() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);

  return (
    <header
      className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 lg:gap-3 lg:px-8">
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
  );
}
