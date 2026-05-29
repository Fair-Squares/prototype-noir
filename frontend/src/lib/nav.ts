export type NavItem = {
  num: string;
  label: string;
  href: string;
  blurb: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Portal",
    items: [
      { num: "01", label: "Overview",     href: "/",           blurb: "Fund position at a glance" },
      { num: "02", label: "Projects",     href: "/fund",       blurb: "Housing fund and properties" },
      { num: "03", label: "Portfolio",    href: "/portfolio",  blurb: "Your balances and rewards" },
      { num: "04", label: "Invest",       href: "/invest",     blurb: "Deposit and withdraw" },
      { num: "05", label: "Governance",   href: "/governance", blurb: "Proposals and voting" },
      { num: "06", label: "Trade",        href: "/dex",        blurb: "Shares and EUR orderbook" },
      { num: "07", label: "Verification", href: "/kyc",        blurb: "Identity and investor status" },
    ],
  },
  {
    label: "Reference",
    items: [
      { num: "08", label: "Reference",    href: "/reference",  blurb: "Parameters and metrics" },
      { num: "09", label: "How it works", href: "/explain",    blurb: "Mechanics and glossary" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findRoute(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_NAV_ITEMS.find((item) => item.href === "/");
  return ALL_NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
}
