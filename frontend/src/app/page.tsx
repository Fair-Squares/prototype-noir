"use client";

import Link from "next/link";
import { PageHero } from "@/components/SimplePage";

const PROTOTYPE_FEATURES = [
  { href: "/fund", title: "Fund", body: "Public fund stats: NAV, deposits, DeFi allocation." },
  { href: "/invest", title: "Invest", body: "KYC-gated private deposits and withdrawals." },
  { href: "/portfolio", title: "Portfolio", body: "Private FSFT balance and NAV-derived value." },
  { href: "/governance", title: "Vote", body: "Private secret-ballot governance on allocations." },
  { href: "/dex", title: "Trade", body: "Investor-gated FSFT/EUR secondary orderbook." },
  { href: "/rewards", title: "Rewards", body: "Epoch reward allocations and claims." },
  { href: "/kyc", title: "KYC", body: "zkPassport verification with dev-mode skip." },
  { href: "/explain", title: "How it works", body: "Prototype mechanics, flows, and glossary." },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Fair Squares Prototype"
        subtitle="The Aztec/Noir working prototype of the Fair Squares protocol — private deposits, secret-ballot governance, and capped-return distribution. For the public project and the broader thesis, visit fair-squares.nl."
        ctaHref="https://fair-squares.nl"
        ctaLabel="fair-squares.nl"
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PROTOTYPE_FEATURES.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-border bg-card p-4 transition hover:border-fs-teal/40 hover:bg-fs-mint/30"
          >
            <h2 className="text-lg font-semibold text-text-1">{item.title}</h2>
            <p className="mt-2 text-sm text-text-2">{item.body}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-text-1">About this prototype</h2>
        <p className="mt-2 text-sm text-text-2">
          This app is a working prototype on Aztec 4.2.1: KYC-gated private deposits into a housing fund,
          secret-ballot governance over allocations, NAV-based share accounting, and a private secondary
          market for fund shares. It is not the public project website.
        </p>
        <p className="mt-3 text-sm text-text-2">
          For the public-facing project, mission, and how-it-works narrative, see{" "}
          <a
            href="https://fair-squares.nl"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fs-teal hover:underline"
          >
            fair-squares.nl
          </a>{" "}
          and{" "}
          <a
            href="https://fair-squares.nl/how-it-works"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fs-teal hover:underline"
          >
            fair-squares.nl/how-it-works
          </a>
          .
        </p>
      </section>
    </div>
  );
}
