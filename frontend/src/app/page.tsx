"use client";

import Link from "next/link";
import { NAV_SECTIONS } from "@/lib/nav";

export default function HomePage() {
  const appSection = NAV_SECTIONS[0];
  const refSection = NAV_SECTIONS[1];

  return (
    <div className="space-y-6">
      {/* Cover sheet — prototype identity and one-line description */}
      <section className="surface relative overflow-hidden p-6 lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="proto-stamp">Prototype · v4.3.0</span>
              <span className="text-tag text-text-3">/ · index</span>
            </div>
            <h1 className="mt-4 max-w-2xl">Fair Squares — working Aztec / Noir prototype.</h1>
            <p className="mt-3 max-w-xl text-text-2">
              Private deposits, secret-ballot governance, NAV-based share accounting, and a private
              secondary market — running on Aztec 4.3.0.
            </p>
            <p className="mt-2 max-w-xl text-text-2">
              For the public project, mission, and how-it-works narrative, visit{" "}
              <a
                href="https://fair-squares.nl"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-fs-teal-dark hover:text-fs-magenta"
              >
                fair-squares.nl
              </a>
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/fund"
                className="inline-flex items-center gap-2 rounded-md bg-fs-anthracite px-4 py-2 font-semibold text-white hover:bg-fs-anthracite-soft"
              >
                Enter the fund
                <Arrow />
              </Link>
              <Link
                href="/explain"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 font-semibold text-text-1 hover:border-fs-teal/40 hover:bg-fs-mint/40"
              >
                How it works
              </Link>
            </div>
          </div>

          {/* Build sheet */}
          <dl className="grid grid-cols-2 gap-3 text-meta">
            <BuildRow term="Stack" value="Next.js + Aztec 4.3.0" />
            <BuildRow term="Mode" value="Simulation / live" />
            <BuildRow term="Contracts" value="7 Noir" />
            <BuildRow term="Routes" value="9" />
            <BuildRow term="Identity" value="zkPassport KYC" />
            <BuildRow term="Distribution" value="Capped return" />
          </dl>
        </div>
      </section>

      {/* App routes — TOC card */}
      <section className="surface p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2>App</h2>
          <span className="text-tag text-text-3">{appSection.items.length} routes</span>
        </div>
        <ul className="divide-y divide-border">
          {appSection.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-3 hover:bg-fs-mint/30 -mx-2 px-2 rounded-md"
              >
                <span className="text-num text-text-3 group-hover:text-fs-magenta">{item.num}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-text-1">{item.label}</span>
                  <span className="block text-meta">{item.blurb}</span>
                </span>
                <Arrow className="opacity-30 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Reference */}
      <section className="surface p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2>Reference</h2>
          <span className="text-tag text-text-3">{refSection.items.length} route</span>
        </div>
        <ul className="divide-y divide-border">
          {refSection.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-3 hover:bg-fs-mint/30 -mx-2 px-2 rounded-md"
              >
                <span className="text-num text-text-3 group-hover:text-fs-magenta">{item.num}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-text-1">{item.label}</span>
                  <span className="block text-meta">{item.blurb}</span>
                </span>
                <Arrow className="opacity-30 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BuildRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="border-t border-border pt-2">
      <dt className="text-tag text-text-3">{term}</dt>
      <dd className="mt-1 font-semibold text-text-1">{value}</dd>
    </div>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-opacity ${className}`}
    >
      <path
        d="M3 10.5L10.5 3M5 3h5.5v5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
