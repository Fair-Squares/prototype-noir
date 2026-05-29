"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, findRoute } from "@/lib/nav";
import RuntimeModeChip from "@/components/RuntimeModeChip";

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[260px] flex-col border-r border-border bg-card/70 backdrop-blur">
      {/* Brand block */}
      <div className="border-b border-border px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-fs-anthracite font-semibold text-white">
            FS
          </span>
          <span className="leading-tight">
            <span className="block font-semibold text-text-1">Fair Squares</span>
            <span className="text-meta">Affordable-housing investor portal</span>
          </span>
        </Link>
        <div className="mt-4 flex items-center gap-2">
          <RuntimeModeChip />
        </div>
      </div>

      {/* TOC */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="text-tag mb-2 px-3 text-text-3">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = active?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="nav-row"
                      data-active={isActive ? "true" : "false"}
                    >
                      <span className="num">{item.num}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{item.label}</span>
                        <span className="block text-meta truncate">{item.blurb}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer block — link out to the public project */}
      <div className="border-t border-border px-5 py-4">
        <p className="text-tag text-text-3">Public project</p>
        <a
          href="https://fair-squares.nl"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 font-semibold text-fs-teal-dark hover:text-fs-magenta"
        >
          fair-squares.nl
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 9l6-6M5 3h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </aside>
  );
}

export function MobileRouteStrip() {
  const pathname = usePathname() ?? "/";
  const active = findRoute(pathname);

  return (
    <nav className="lg:hidden border-b border-border bg-card/60 backdrop-blur">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
        {NAV_SECTIONS.flatMap((section) => section.items).map((item) => {
          const isActive = active?.href === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="route-chip"
              data-active={isActive ? "true" : "false"}
            >
              <span className="num">{item.num}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileBrand() {
  return (
    <div className="flex items-center gap-3 lg:hidden">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-fs-anthracite text-sm font-semibold text-white">
        FS
      </span>
      <div className="leading-tight">
        <span className="block font-semibold text-text-1">Fair Squares</span>
        <span className="text-meta">Investor portal</span>
      </div>
    </div>
  );
}
