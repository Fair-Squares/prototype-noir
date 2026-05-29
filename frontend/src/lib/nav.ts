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
    label: "App",
    items: [
      { num: "01", label: "Home",    href: "/",           blurb: "Prototype index" },
      { num: "02", label: "Fund",    href: "/fund",       blurb: "NAV, allocation, status" },
      { num: "03", label: "Invest",  href: "/invest",     blurb: "Deposit and withdraw" },
      { num: "04", label: "Account", href: "/portfolio",  blurb: "Your balances and rewards" },
      { num: "05", label: "Vote",    href: "/governance", blurb: "Secret-ballot governance" },
      { num: "06", label: "Trade",   href: "/dex",        blurb: "FSFT / EUR orderbook" },
      { num: "07", label: "Rewards", href: "/rewards",    blurb: "Epoch rewards and claims" },
      { num: "08", label: "KYC",     href: "/kyc",        blurb: "zkPassport verification" },
    ],
  },
  {
    label: "Reference",
    items: [
      { num: "09", label: "How it works", href: "/explain", blurb: "Mechanics and glossary" },
      { num: "10", label: "Parameters", href: "/reference", blurb: "Chain & governance metrics" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findRoute(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_NAV_ITEMS.find((item) => item.href === "/");
  return ALL_NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
}
