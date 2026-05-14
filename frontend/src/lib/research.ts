export type ResearchSource = {
  title: string;
  publisher: string;
  year: string;
  url: string;
  takeaway: string;
  implication: string;
};

export const researchSources: ResearchSource[] = [
  {
    title: "The effect of housing subsidies on new construction",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2025",
    url: "https://www.cpb.nl/de-effecten-van-subsidies-op-woningbouw",
    takeaway:
      "CPB warns that broad building subsidies often do not create many extra homes when land and permits are the real bottlenecks. In that situation, public money can leak into higher land prices instead of lower rents or more homes.",
    implication:
      "Fair Squares should not act like a generic subsidy. It should fund only a clear, open-book financing gap, after land terms are fixed, and only when affordability is locked in.",
  },
  {
    title: "How new housing affects affordability and fit",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/de-effecten-van-woningbouw-op-betaalbaarheid-en-vraaggerichtheid",
    takeaway:
      "For many middle-income households, the biggest help is simply more homes. CPB also notes that when land is scarce, smaller and more efficient homes can help more people than larger homes on the same land.",
    implication:
      "Fair Squares should prefer projects that add real homes efficiently: mid-rent apartments, building splits, transformations and rooftop additions, not speculative land plays.",
  },
  {
    title: "A perspective on the housing market",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2026",
    url: "https://www.cpb.nl/publicatie/perspectief-op-de-woningmarkt",
    takeaway:
      "CPB argues that the housing market has to be viewed as one connected system. A measure that helps one group can make scarcity worse for another group if it only increases demand for limited homes.",
    implication:
      "Fair Squares should focus on supply-side project finance. The promise is not 'more purchasing power', but helping specific affordable homes actually get built or preserved.",
  },
  {
    title: "The rent dilemma: affordability versus availability",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/huurdilemma-betaalbaarheid-versus-beschikbaarheid",
    takeaway:
      "Rent caps can make homes cheaper for tenants who get them, but they can also make rental projects less attractive to owners and investors. That can reduce the number of available rental homes.",
    implication:
      "This is the Fair Squares wedge: provide lower-return, mission-aligned capital so capped-rent projects can still work financially.",
  },
  {
    title: "Measures are needed to address a €19.4bn housing-corporation funding gap",
    publisher: "Dutch central government",
    year: "2026",
    url: "https://www.rijksoverheid.nl/actueel/nieuws/2026/01/29/maatregelen-nodig-tegen-tekort-woningcorporaties-van-%E2%82%AC-194-miljard",
    takeaway:
      "The Dutch government reports that housing corporations face a €19.4bn shortfall against €115bn of agreed investments through 2034. Without extra room, new-build, maintenance and sustainability targets are at risk.",
    implication:
      "Fair Squares can be a complementary project-level capital layer for mission-driven operators. It does not replace public policy, but it can help good projects move forward.",
  },
  {
    title: "900,000 new homes to meet growing demand",
    publisher: "Dutch central government",
    year: "current programme",
    url: "https://www.rijksoverheid.nl/onderwerpen/volkshuisvesting/nieuwe-woningen",
    takeaway:
      "The Netherlands aims to build 900,000 homes through 2030, with two-thirds intended to be affordable rental or affordable purchase homes.",
    implication:
      "Fair Squares should target the affordable part of that pipeline, especially projects where a small but difficult funding gap blocks delivery.",
  },
  {
    title: "Primos forecast 2025",
    publisher: "ABF Research",
    year: "2025",
    url: "https://abfresearch.nl/publicaties/primos-prognose-2025/",
    takeaway:
      "ABF estimates the 2025 statistical housing shortage at roughly 396,000 homes, or 4.8% of the housing stock.",
    implication:
      "The need is urgent, but Fair Squares should still be disciplined: capital should be tied to additional homes, affordability years and clear project reporting.",
  },
];

export const productionPath = [
  {
    phase: "1",
    title: "Publish the plain-English thesis",
    status: "Now",
    body: "Explain the problem simply: affordable homes often fail because capped rents lower the return. Fair Squares provides the patient capital layer that can make those projects work.",
  },
  {
    phase: "2",
    title: "Find one real pilot partner",
    status: "Next 30 days",
    body: "Talk to municipalities, housing corporations, social developers and owners with transformation or rooftop-addition projects. Ask for one project with a documented funding gap.",
  },
  {
    phase: "3",
    title: "Choose the legal wrapper",
    status: "Before fundraising",
    body: "Decide whether the first pilot should use a fund, cooperative, foundation, project company or loan-note structure. Check the AFM/AIFMD perimeter before offering anything publicly.",
  },
  {
    phase: "4",
    title: "Build only what the pilot needs",
    status: "Pilot build",
    body: "Use the protocol for investor onboarding, project reporting, capped-return accounting, governance and privacy-preserving eligibility where it helps the real pilot.",
  },
  {
    phase: "5",
    title: "Scale after proof",
    status: "Post-pilot",
    body: "Measure homes enabled, rent discount, affordability years, capital brought in and covenant compliance before turning Fair Squares into a broader product."
  },
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
