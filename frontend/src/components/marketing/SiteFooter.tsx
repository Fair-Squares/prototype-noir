"use client";

import Link from "next/link";
import RuntimeModeChip from "@/components/RuntimeModeChip";

// App-wide dark footer (replaces layout.tsx's calm footer). Recreates the
// website kit's Footer.jsx on our design system: full-bleed anthracite band,
// a brand column, three teal-headed link columns, and an honest bottom bar.
//
// Honesty rules (CLAUDE.md): every link points to a REAL app route; the
// runtime label is the honest "Demo network · no real funds" via
// <RuntimeModeChip/>, never the kit's dishonest "Public testnet". Social links
// are PLAIN TEXT (icon-light — no icon library); only links with a real URL
// are rendered (no dead "#" anchors).

// The public project repo (origin remote). GitHub is the only social with a
// known real URL — the kit's Twitter/LinkedIn are omitted rather than
// dead-linked.
const REPO_URL = "https://github.com/Fair-Squares/prototype-noir";
const SITE_URL = "https://fair-squares.nl";

type FooterLink = { label: string; href: string; external?: boolean };

const LINK_COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Invest",
    links: [
      { label: "Projects", href: "/fund" },
      { label: "Invest", href: "/invest" },
      { label: "Your portfolio", href: "/portfolio" },
      { label: "Verification", href: "/kyc" },
    ],
  },
  {
    title: "Participate",
    links: [
      { label: "Governance", href: "/governance" },
      { label: "Trade", href: "/dex" },
      { label: "Rewards", href: "/rewards" },
      { label: "About Fair Squares", href: "/learn" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "How it works", href: "/explain" },
      { label: "Reference", href: "/reference" },
      { label: "Impact calculator", href: "/learn#calculator" },
    ],
  },
];

const LINK_CLASS =
  "text-fs-mint/80 transition-opacity hover:text-fs-mint hover:opacity-100 w-fit";

export function SiteFooter() {
  return (
    <footer className="bg-fs-anthracite text-white">
      <div className="mx-auto max-w-6xl px-4 pb-9 pt-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-light.png"
              alt="Fair Squares"
              className="h-8 w-auto"
            />
            <p className="text-body mt-5 max-w-[280px] text-fs-mint/85">
              A community-owned path to affordable homes — fair, transparent,
              and built for people, not profit.
            </p>
            {/* Plain-text social row — icon-light. Only real URLs are rendered. */}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-caption">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className={LINK_CLASS}
              >
                GitHub
              </a>
              <a
                href={SITE_URL}
                target="_blank"
                rel="noreferrer"
                className={LINK_CLASS}
              >
                fair-squares.nl
              </a>
            </div>
          </div>

          {/* Three link columns — every row a real app route */}
          {LINK_COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-label mb-4">{col.title}</div>
              <div className="flex flex-col gap-3 text-body">
                {col.links.map((link) =>
                  link.external ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className={LINK_CLASS}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.label} href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-fs-mint/55">
            © 2026 Fair Squares · Affordable housing protocol
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-caption">
            <RuntimeModeChip />
            <Link href="/explain" className={LINK_CLASS}>
              How it works
            </Link>
            <Link href="/reference" className={LINK_CLASS}>
              Reference
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
