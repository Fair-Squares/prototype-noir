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
 * UX_SIMPLIFICATION_PLAN.md target IA: 7 destinations for 3 personas.
 * Home · Homes · Portfolio (primary) — Vote · Trade · Verification (More) —
 * About (reference). Deposit/withdraw and every claim live on Portfolio (the
 * money hub); learn/explain/reference are one About door. /invest, /rewards,
 * /explain and /reference redirect (next.config.ts) so old links keep working.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Portal",
    items: [
      { num: "01", label: "Home",         href: "/",           blurb: "Your journey and next step",           tier: "primary" },
      { num: "02", label: "Homes",        href: "/fund",       blurb: "Every home, from submission to owned", tier: "primary" },
      { num: "03", label: "Portfolio",    href: "/portfolio",  blurb: "Your money: value, deposit, claims",   tier: "primary" },
      { num: "04", label: "Votes",            href: "/governance", blurb: "The community vote on homes",       tier: "more-account" },
      { num: "05", label: "Secondary market", href: "/dex",        blurb: "Optional: sell or buy fund shares", tier: "more-account" },
      { num: "06", label: "Verification", href: "/kyc",        blurb: "Identity and investor status",         tier: "more-account" },
    ],
  },
  {
    label: "Reference",
    items: [
      { num: "07", label: "Guided demo",        href: "/demo",  blurb: "The whole cycle in five steps",     tier: "more-reference" },
      { num: "08", label: "About Fair Squares", href: "/learn", blurb: "Mission, how it works, parameters", tier: "more-reference" },
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
