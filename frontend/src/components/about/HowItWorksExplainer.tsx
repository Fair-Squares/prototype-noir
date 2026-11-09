import Link from "next/link";

import { AdvancedDetails, Section } from "@/components/ui";

/**
 * The protocol explainer, moved from the
 * retired /explain route onto the single About page. Pure copy -- no on-chain
 * reads. The #privacy anchor is preserved for the shell TrustChip link.
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
    body: "Property owners submit homes for review before the fund commits any money.",
  },
  {
    n: "02",
    title: "Members pool capital",
    body: "Verified members deposit into the fund to help finance homes together.",
  },
  {
    n: "03",
    title: "Members vote on each acquisition",
    body: "Members vote on reviewed proposals. The fund commits money only after approval.",
  },
  {
    n: "04",
    title: "The fund buys approved homes",
    body: "Approved homes receive funding. Members can track their shares and claim rental income; unused capital stays in the fund.",
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
    body: "What the fund is worth: deployed capital plus capital still waiting to be invested in the next home.",
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

export function HowItWorksExplainer() {
  return (
    <div className="space-y-6">
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
          Your deposit buys shares in the fund, not ownership of a specific home.
          Fund value includes its homes and unused capital. Rental income is
          separate from that value; participation rewards are separate from rent.
          Returns are not guaranteed, and selling shares depends on finding a buyer.
        </p>
      </Section>

      {/* #privacy anchor target for the shell TrustChip "What does private
          mean?" link. scroll-mt keeps the heading clear of the sticky top bar. */}
      <div id="privacy" className="scroll-mt-24">
        <Section
          title="What “private” means here"
          description="Privacy protects member information while the fund’s rules remain verifiable."
        >
          <div className="space-y-4 text-text-2">
            <p className="text-body">
              Aztec can verify actions without publishing the private information
              behind them. This prototype uses shared server-managed test accounts:
              do not use it for real money or personal documents. The privacy
              features below describe what is hidden from the public, not from
              the demo server operator.
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

      <AdvancedDetails summary="Financial terms">
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

      </AdvancedDetails>
      <Section
        title="The public project"
        description="Read about the mission and pilot terms on the Fair Squares website."
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
