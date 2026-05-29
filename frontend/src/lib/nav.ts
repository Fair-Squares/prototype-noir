export type NavTier = "primary" | "more-account" | "more-reference";

export type NavItem = {
  num: string;
  label: string;
  href: string;
  blurb: string;
  /** Where the item lives in the app shell. */
  tier: NavTier;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * Single source of truth for the app navigation.
 *
 * - `tier: "primary"`      → everyday tabs shown directly in the top bar.
 * - `tier: "more-account"` → occasional tasks, tucked under the "More" menu.
 * - `tier: "more-reference"` → reference / help, under "More" below a divider.
 *
 * `num` and `blurb` are retained for tooltips and the mobile drawer's
 * supporting copy; they are no longer rendered as a numbered console TOC.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Portal",
    items: [
      { num: "01", label: "Overview",     href: "/",           blurb: "Fund position at a glance",      tier: "primary" },
      { num: "02", label: "Portfolio",    href: "/portfolio",  blurb: "Your balances and rewards",      tier: "primary" },
      { num: "03", label: "Projects",     href: "/fund",       blurb: "Housing fund and properties",    tier: "primary" },
      { num: "04", label: "Invest",       href: "/invest",     blurb: "Deposit and withdraw",           tier: "primary" },
      { num: "05", label: "Governance",   href: "/governance", blurb: "Proposals and voting",           tier: "primary" },
      { num: "06", label: "Trade",        href: "/dex",        blurb: "Shares and EUR orderbook",       tier: "more-account" },
      { num: "07", label: "Verification", href: "/kyc",        blurb: "Identity and investor status",   tier: "more-account" },
      { num: "08", label: "Rewards",      href: "/rewards",    blurb: "Participation rewards",          tier: "more-account" },
    ],
  },
  {
    label: "Reference",
    items: [
      { num: "09", label: "Reference",    href: "/reference",  blurb: "Parameters and metrics",  tier: "more-reference" },
      { num: "10", label: "How it works", href: "/explain",    blurb: "Mechanics and glossary",  tier: "more-reference" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export const PRIMARY_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.tier === "primary");
export const MORE_ACCOUNT_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.tier === "more-account");
export const MORE_REFERENCE_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.tier === "more-reference");

/** Resolve the nav item that owns a given pathname (exact for "/", prefix otherwise). */
export function findRoute(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_NAV_ITEMS.find((item) => item.href === "/");
  return ALL_NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
}

/** True when the active route lives under the "More" menu (so its trigger can light up). */
export function isMoreActive(pathname: string): boolean {
  const route = findRoute(pathname);
  return route?.tier === "more-account" || route?.tier === "more-reference";
}
