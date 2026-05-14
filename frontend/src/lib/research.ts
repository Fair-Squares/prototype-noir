export type ResearchSource = {
  title: string;
  publisher: string;
  year: string;
  url: string;
  takeaway: string;
  implication: string;
};

export type FairSquaresDirection = {
  title: string;
  body: string;
};

export const coreProblem = {
  short:
    "Affordable housing policy often lowers rents before the financing problem is solved.",
  long:
    "CPB’s housing work keeps returning to the same trade-off: the Netherlands needs more affordable homes, but rent limits, scarce land, slow procedures and stretched housing corporations can make those homes harder to finance. Fair Squares fits where a real project is useful, demand is clear, but the final capital layer does not work at normal market-return expectations.",
};

export const researchSources: ResearchSource[] = [
  {
    title: "The effect of housing subsidies on new construction",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2025",
    url: "https://www.cpb.nl/de-effecten-van-subsidies-op-woningbouw",
    takeaway:
      "CPB finds that broad construction subsidies have limited effect when land and regulation prevent quick supply growth. They can also leak into higher land prices. Subsidies are more promising when a project is otherwise not profitable, for example because regulated rents do not cover costs, or when they support efficient forms such as splits and rooftop additions.",
    implication:
      "Fair Squares should stay project-specific: fund the documented gap between affordable rents and project costs, after land/control terms are clear, instead of acting like a broad subsidy or speculative land strategy.",
  },
  {
    title: "How new housing affects affordability and fit",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/de-effecten-van-woningbouw-op-betaalbaarheid-en-vraaggerichtheid",
    takeaway:
      "CPB shows that for many middle-income households the main relief is substantially more homes. Where land is scarce, smaller homes can help more households than larger homes on the same land.",
    implication:
      "Fair Squares should favour efficient supply: compact mid-rent homes, transformations, splits and rooftop additions where the same scarce land can house more people affordably.",
  },
  {
    title: "A perspective on the housing market",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2026",
    url: "https://www.cpb.nl/publicatie/perspectief-op-de-woningmarkt",
    takeaway:
      "CPB argues that housing policy has to be viewed as one connected system. Measures in one segment affect others; extra demand support can increase scarcity, while affordable building requires explicit choices about location, subsidy and flexibility.",
    implication:
      "Fair Squares should be a supply-side financing layer, not extra bidding power. The protocol should make clear which homes are enabled, which affordability choice is being made and how outcomes are reported.",
  },
  {
    title: "The rent dilemma: affordability versus availability",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/huurdilemma-betaalbaarheid-versus-beschikbaarheid",
    takeaway:
      "CPB describes the central rental-market dilemma: limiting rents helps tenants who get a home, but can reduce the willingness of private owners and investors to offer mid-rent homes. Housing corporations may help, but they also face capacity, funding and allocation constraints.",
    implication:
      "This is the core Fair Squares gap: use capped-return, mission-aligned capital so affordability rules do not automatically remove homes from the rental supply pipeline.",
  },
  {
    title: "Measures are needed to address a €19.4bn housing-corporation funding gap",
    publisher: "Dutch central government",
    year: "2026",
    url: "https://www.rijksoverheid.nl/actueel/nieuws/2026/01/29/maatregelen-nodig-tegen-tekort-woningcorporaties-van-%E2%82%AC-194-miljard",
    takeaway:
      "The Dutch government reports that housing corporations face a €19.4bn shortfall against €115bn of agreed investments through 2034. Without extra room, new-build, maintenance and sustainability targets are at risk.",
    implication:
      "Fair Squares can complement, not replace, public and corporation finance: a transparent project layer for affordability gaps where a partner has a real plan but limited balance-sheet room.",
  },
  {
    title: "900,000 new homes to meet growing demand",
    publisher: "Dutch central government",
    year: "current programme",
    url: "https://www.rijksoverheid.nl/onderwerpen/volkshuisvesting/nieuwe-woningen",
    takeaway:
      "The Netherlands aims to build 900,000 homes through 2030, with two-thirds intended to be affordable rental or affordable purchase homes.",
    implication:
      "Fair Squares belongs in the affordable part of that pipeline, where the social target is clear but the return profile needs a different type of capital.",
  },
  {
    title: "Primos forecast 2025",
    publisher: "ABF Research",
    year: "2025",
    url: "https://abfresearch.nl/publicaties/primos-prognose-2025/",
    takeaway:
      "ABF estimates the 2025 statistical housing shortage at roughly 396,000 homes, or 4.8% of the housing stock.",
    implication:
      "The shortage makes speed important, but Fair Squares should still tie capital to additional homes, affordability years and reporting rather than vague impact claims.",
  },
];

export const fairSquaresDirection: FairSquaresDirection[] = [
  {
    title: "Turn the rent dilemma into a finance problem",
    body: "If rent limits make a project socially useful but financially thin, Fair Squares can supply the capped-return layer that normal capital will not provide.",
  },
  {
    title: "Use the protocol for trust, not hype",
    body: "Fair Squares already has rails for pooled funding, project accounting, governance and participant eligibility. Those rails should show what was funded and whether the affordability promise is kept.",
  },
  {
    title: "Stay close to real supply",
    body: "The best fit is not abstract housing exposure. It is compact homes, transformations, splits and rooftop additions where capital can unlock measurable additional supply.",
  },
  {
    title: "Keep the upside with the housing outcome",
    body: "Investors can receive a capped return, while excess value is protected through reporting, governance and affordability conditions instead of being extracted as speculation.",
  },
];

export const protocolFit = [
  "Funding pools for a specific housing project or portfolio",
  "Transparent project reporting: gap, use of funds, homes enabled and affordability period",
  "Governance for key project decisions and covenant changes",
  "Eligibility and privacy rails where participant checks are needed",
  "On-chain accounting for capped returns and distributions when the legal wrapper allows it",
];

export const keyMetrics = [
  "Affordable homes enabled per €1m of Fair Squares capital",
  "Rent discount versus the local market or regulatory benchmark",
  "Affordability years locked into the project",
  "Documented financing gap closed",
  "Months saved compared with a delayed or cancelled project",
  "Extra capital brought in alongside Fair Squares",
  "Covenant compliance and reporting completeness",
];
