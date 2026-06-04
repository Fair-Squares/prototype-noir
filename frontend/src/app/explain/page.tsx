import Link from "next/link";

import { PageHeader, Section } from "@/components/ui";

/**
 * Static "How it works" / explainer route. Pure copy — no on-chain reads — so
 * it deliberately renders no live figures. Ordered to match the design-doc
 * Copy Guidelines hierarchy: housing outcome → financing structure → investor
 * position → protocol proof / privacy → token mechanics.
 */

interface Step {
  n: string;
  title: string;
  body: string;
}

const FLOW: Step[] = [
  {
    n: "01",
    title: "A home needs funding",
    body: "The fund exists to acquire and hold affordable homes. Each potential acquisition is brought to the members as a proposal before any capital moves.",
  },
  {
    n: "02",
    title: "Members pool capital",
    body: "Verified investors deposit cash into the housing fund. Pooled capital is what lets the fund acquire homes that no single member could fund alone.",
  },
  {
    n: "03",
    title: "Members vote on each acquisition",
    body: "Governance proposes an acquisition and members vote. Capital is only committed to a home once a proposal passes — members decide what the fund buys.",
  },
  {
    n: "04",
    title: "Capital is deployed; the rest waits to be put to work",
    body: "Approved acquisitions are funded; capital still waiting to be deployed can be parked in a yield source (no yield adapter is active yet). Members hold their position, can trade it, keep voting, and claim rewards.",
  },
];

interface Glossary {
  term: string;
  body: string;
}

// Ordered housing/finance-first: what you put in, what the fund is worth, what
// you hold, then the protocol/token instruments last.
const GLOSSARY: Glossary[] = [
  {
    term: "Housing fund",
    body: "The pool of member capital used to acquire and hold affordable homes. Deposits flow in; approved acquisitions are funded out of it.",
  },
  {
    term: "Deposit",
    body: "Cash a verified member commits to the fund. Deposits buy a share of the fund and are settled in the fund's cash token.",
  },
  {
    term: "Fund value",
    body: "What the fund is worth: deployed capital plus capital still waiting to be invested (some of which may be parked in a yield source — though no yield is actually earned yet).",
  },
  {
    term: "Share price",
    body: "Fund value divided by the number of fund shares in circulation. It is how a deposit converts to shares, and how a position is valued.",
  },
  {
    term: "Rewards",
    body: "Protocol rewards distributed to members for depositing, holding fund shares, and participating in governance — not a speculative yield product.",
  },
  {
    term: "Cash token (EURs)",
    body: "The stable cash token used to deposit into the fund and to settle trades between members.",
  },
  {
    term: "Fund shares (FSFT)",
    body: "The token that records each member's share of the fund. Holding it is what gives you exposure to fund value, voting rights, and rewards.",
  },
  {
    term: "Member trading",
    body: "Members can buy and sell fund shares from each other. Orders must sit inside the protocol's price bands; deeper market data lives in Reference.",
  },
];

interface Privacy {
  title: string;
  body: string;
}

const PRIVACY: Privacy[] = [
  {
    title: "Your position is private",
    body: "How much you deposited and how many shares you hold are visible to you, not to other members or the public.",
  },
  {
    title: "Your verification is private",
    body: "Eligibility checks prove you are a verified member without exposing your personal identity documents on-chain.",
  },
  {
    title: "Your votes are private",
    body: "You can prove you are eligible to vote and that you voted once, without revealing which way you voted.",
  },
  {
    title: "The rules stay verifiable",
    body: "Anyone can confirm deposits, approvals, and settlements followed the protocol's rules — the proof is public even when the data behind it is not.",
  },
];

export default function ExplainPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="How it works"
        title="A private fund for affordable housing"
        description={
          <>
            Fair Squares pools member capital to acquire and hold affordable
            homes. Members vote to approve each acquisition, and every position
            is held and verified privately. This page explains how it works,
            end to end.
          </>
        }
        actions={
          <Link
            href="https://fair-squares.nl/how-it-works"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            Public project guide
          </Link>
        }
      />

      <Section
        title="How the fund works"
        description="From a home that needs funding to a member position you can hold, vote with, and value."
      >
        <ol className="space-y-4">
          {FLOW.map((step) => (
            <li
              key={step.n}
              className="grid grid-cols-[2.5rem_1fr] items-start gap-3"
            >
              <span className="text-num text-fs-magenta" aria-hidden="true">
                {step.n}
              </span>
              <div className="min-w-0">
                <p className="text-body font-semibold text-text-1">
                  {step.title}
                </p>
                <p className="text-body mt-1 text-text-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="What you hold as a member"
        description="A deposit becomes a share of the fund. That share is what you own."
      >
        <p className="text-body text-text-2">
          When you deposit, your cash buys fund shares at the current share
          price. Those shares represent your slice of the fund&apos;s value —
          the homes it has acquired plus the capital still waiting to be
          invested. Your shares are also what give you the right to vote on
          acquisitions and to receive rewards. You can hold them, trade them
          with other members inside the protocol&apos;s price bands, or use them
          to participate in governance.
        </p>
      </Section>

      {/* #privacy anchor target for the shell TrustChip "What does private
          mean?" link. scroll-mt keeps the heading clear of the sticky top bar. */}
      <div id="privacy" className="scroll-mt-24">
        <Section
          title="What “private” means here"
          description="Privacy is used as assurance, not secrecy — it protects members while keeping the protocol verifiable."
        >
          <div className="space-y-4 text-text-2">
            <p className="text-body">
              Fair Squares runs on Aztec, which lets a member prove something is
              true without revealing the underlying details. In practice that
              means your individual position and identity stay private, while the
              rules of the fund remain provably enforced.
            </p>
            <dl className="grid gap-4 sm:grid-cols-2">
              {PRIVACY.map(({ title, body }) => (
                <div key={title}>
                  <dt className="text-body font-semibold text-text-1">
                    {title}
                  </dt>
                  <dd className="text-body mt-1">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </div>

      <Section
        title="Glossary"
        description="Plain definitions, ordered from what you put in to the instruments behind it."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          {GLOSSARY.map(({ term, body }) => (
            <div key={term} className="border-l-2 border-fs-teal/40 pl-3">
              <dt className="text-body font-semibold text-text-1">{term}</dt>
              <dd className="text-body mt-1 text-text-2">{body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="The public project"
        description="This app is the protocol console. The wider Fair Squares mission, pilot terms, and full guide live on the public site."
      >
        <p className="text-body text-text-2">
          For the full public-facing how-it-works guide, project mission, and
          pilot terms, open{" "}
          <Link
            href="https://fair-squares.nl/how-it-works"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fs-teal-dark hover:text-fs-magenta"
          >
            fair-squares.nl/how-it-works
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
