"use client";

import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";

/**
 * The disconnected home lead — about the PROTOTYPE, not the mission. The
 * mission brochure lives on /learn and fair-squares.nl; a visitor here is
 * standing in front of a working app, so this answers only: what is this,
 * what can I do right now, what should I expect, and where do I start.
 * Deliberately word-lean — subtraction is the design.
 */
/** isSimulation: null = mode not known yet (stats still loading) — make no
 * environment claim rather than guessing (the first frame must not lie).
 * rorPct: the fund's real on-chain return parameter in percent (null while
 * loading / unset) — the headline states the rate only when it's real (D6). */
export function PrototypeIntro({
  isSimulation,
  rorPct,
}: {
  isSimulation: boolean | null;
  rorPct: number | null;
}) {
  const { connect } = useWallet();

  // §4.1 finance-plus-outcome one-liner: money and outcome in one breath.
  const dealLine =
    rorPct != null
      ? `Invest in affordable housing. Earn a ${rorPct.toFixed(0)}% target annual return from rent, capped by design — so families pay below-market rent.`
      : "Invest in affordable housing. Earn a capped target annual return from rent — so families pay below-market rent.";

  const paths = [
    { label: "Invest demo euros, earn a capped return", href: "/portfolio#deposit" },
    { label: "Offer a property for the fund to buy", href: "/fund/submit" },
    { label: "Review homes as the housing council", href: "/governance" },
  ];

  return (
    <section className="max-w-2xl" aria-labelledby="prototype-intro-heading">
      <span className="chip chip-accent">Working prototype</span>

      <h1 id="prototype-intro-heading" className="text-display mt-4 text-text-1">
        Fair Squares, running on Aztec
      </h1>

      <p className="text-body mt-3 text-text-2">
        {dealLine}{" "}
        {isSimulation == null
          ? "Working end to end."
          : isSimulation
            ? "Working end to end with simulated euros — nothing here is real money."
            : "Working end to end on a live network."}
      </p>

      <ul className="mt-6 space-y-2">
        {paths.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="text-body text-text-1 underline decoration-fs-teal underline-offset-4 hover:text-fs-teal"
            >
              {p.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void connect()} className="btn btn-highlight">
          Pick a demo account
        </button>
        <Link href="/learn" className="btn btn-ghost">
          How it works
        </Link>
      </div>

      <p className="text-body mt-6 text-sm text-text-3">
        The mission behind it:{" "}
        <a
          href="https://fair-squares.nl"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-fs-teal"
        >
          fair-squares.nl
        </a>
      </p>
    </section>
  );
}
