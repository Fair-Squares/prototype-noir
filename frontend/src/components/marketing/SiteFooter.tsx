"use client";

import Link from "next/link";
import RuntimeModeChip from "@/components/RuntimeModeChip";

// App-wide dark footer. S8 (UX_SIMPLIFICATION_PLAN.md): the footer stopped
// mirroring the entire nav (14 links, "Invest" twice) — the top bar is the
// navigation. What remains is the brand, one About door, the two real
// external links, and the honest runtime chip.
//
// Honesty rules (CLAUDE.md): the runtime label is the honest "Demo network ·
// no real funds" via <RuntimeModeChip/>, never "Public testnet". Social links
// are PLAIN TEXT; only links with a real URL are rendered.

const REPO_URL = "https://github.com/Fair-Squares/prototype-noir";
const SITE_URL = "https://fair-squares.nl";

const LINK_CLASS =
  "text-fs-mint/80 transition-opacity hover:text-fs-mint hover:opacity-100 w-fit";

export function SiteFooter() {
  return (
    <footer className="bg-fs-anthracite text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-light.png" alt="Fair Squares" className="h-8 w-auto" />
            <p className="text-body mt-4 max-w-[280px] text-fs-mint/85">
              A community-owned path to affordable homes — fair, transparent,
              and built for people, not profit.
            </p>
          </div>

          {/* S8: four things, not fourteen. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-caption sm:justify-end">
            <Link href="/learn" className={LINK_CLASS}>
              About Fair Squares
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              GitHub
            </a>
            <a href={SITE_URL} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              fair-squares.nl
            </a>
            <RuntimeModeChip />
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="text-caption text-fs-mint/55">
            © 2026 Fair Squares · Affordable housing protocol
          </p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
