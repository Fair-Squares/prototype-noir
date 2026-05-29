import Link from "next/link";

interface ActionLink {
  href: string;
  label: string;
  blurb: string;
}

const LINKS: ActionLink[] = [
  { href: "/invest", label: "Invest", blurb: "Deposit cash into the fund" },
  { href: "/dex", label: "Trade shares", blurb: "Buy or sell fund shares on the market" },
  { href: "/governance", label: "Governance", blurb: "Vote on housing proposals" },
];

/**
 * Available actions — calm link tiles to the routes where an investor acts.
 * Nav targets are anchors (Link), never buttons. Withdrawing and claiming are
 * handled inline on this page, so they are intentionally not links here.
 */
export function ActionLinks() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="surface-muted flex flex-col gap-1 p-4 hover:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          <span className="text-body font-semibold text-text-1">{link.label}</span>
          <span className="text-caption text-text-3">{link.blurb}</span>
        </Link>
      ))}
    </div>
  );
}
