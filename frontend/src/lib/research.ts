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
    title: "De effecten van subsidies op woningbouw",
    publisher: "CPB",
    year: "2025",
    url: "https://www.cpb.nl/de-effecten-van-subsidies-op-woningbouw",
    takeaway:
      "Broad construction subsidies have limited production effect in a rising market and can be capitalised into higher land prices; they are more promising when they bridge a specific unprofitable project gap.",
    implication:
      "Fair Squares should behave like disciplined viability-gap capital: commit only after land/control terms are fixed, require open-book budgets, and tie capital to affordability covenants.",
  },
  {
    title: "De effecten van woningbouw op betaalbaarheid en vraaggerichtheid",
    publisher: "CPB",
    year: "2024",
    url: "https://www.cpb.nl/de-effecten-van-woningbouw-op-betaalbaarheid-en-vraaggerichtheid",
    takeaway:
      "For constrained middle-income households, the number of homes built matters more than the exact home type; where land is scarce, smaller homes help more households.",
    implication:
      "Prioritise projects that increase real unit count: efficient mid-rent units, transformation, splitting and optopping rather than speculative large-unit development.",
  },
  {
    title: "Perspectief op de woningmarkt",
    publisher: "CPB",
    year: "2026",
    url: "https://www.cpb.nl/publicatie/perspectief-op-de-woningmarkt",
    takeaway:
      "Housing policy must be viewed across sectors; extra support can intensify scarcity, and affordable building requires explicit choices about location and subsidy.",
    implication:
      "Position Fair Squares as complementary project finance, not a demand subsidy: it should unlock supply while making trade-offs visible and measurable.",
  },
  {
    title: "Huurdilemma: betaalbaarheid versus beschikbaarheid",
    publisher: "CPB",
    year: "2024",
    url: "https://www.cpb.nl/huurdilemma-betaalbaarheid-versus-beschikbaarheid",
    takeaway:
      "Rent regulation improves affordability for successful tenants but can reduce availability if owners sell homes or investors withdraw from mid-rent supply.",
    implication:
      "The wedge is a lower-return capital layer that keeps rental projects investable while preserving capped rents and avoiding full market-rate return pressure.",
  },
  {
    title: "Maatregelen nodig tegen tekort woningcorporaties van €19,4 miljard",
    publisher: "Rijksoverheid",
    year: "2026",
    url: "https://www.rijksoverheid.nl/actueel/nieuws/2026/01/29/maatregelen-nodig-tegen-tekort-woningcorporaties-van-%E2%82%AC-194-miljard",
    takeaway:
      "Housing corporations face a €19.4bn shortfall against €115bn of agreed investments through 2034; without measures, targets for new-build, maintenance and sustainability are at risk.",
    implication:
      "A project-level co-capital product can help mission-driven operators proceed without replacing public policy or corporation balance sheets.",
  },
  {
    title: "900.000 nieuwe woningen om aan groeiende vraag te voldoen",
    publisher: "Rijksoverheid",
    year: "current programme",
    url: "https://www.rijksoverheid.nl/onderwerpen/volkshuisvesting/nieuwe-woningen",
    takeaway:
      "The Netherlands targets 900,000 new homes through 2030, with two-thirds intended as affordable rental or purchase homes.",
    implication:
      "Fair Squares should target the affordable part of the national pipeline where delivery depends on a small, well-governed financing gap being closed.",
  },
  {
    title: "Primos-prognose 2025",
    publisher: "ABF Research",
    year: "2025",
    url: "https://abfresearch.nl/publicaties/primos-prognose-2025/",
    takeaway:
      "ABF estimates the 2025 statistical housing shortage at roughly 396,000 homes, or 4.8% of the housing stock.",
    implication:
      "The production case is urgent, but the capital should be tied to additional units and affordability duration rather than generic exposure to scarcity.",
  },
];

export const productionPath = [
  {
    phase: "1",
    title: "Research-backed pilot thesis",
    status: "Now",
    body: "Publish the CPB-backed narrative, source library, one-page thesis and draft term sheet. Keep tech secondary until the financing wrapper is credible.",
  },
  {
    phase: "2",
    title: "Find one real pilot partner",
    status: "Next 30 days",
    body: "Approach municipalities, housing corporations, social developers and owners with transformation/optopping opportunities. Ask for a documented project gap.",
  },
  {
    phase: "3",
    title: "Structure the finance wrapper",
    status: "Before tokenisation",
    body: "Decide whether the first vehicle is a fund, cooperative, stichting/STAK, project SPV or loan-note structure. Confirm AFM/AIFMD/consumer-credit constraints.",
  },
  {
    phase: "4",
    title: "Implement reporting + governance",
    status: "Pilot build",
    body: "Use the existing protocol app for investor onboarding, project reporting, capped-return accounting, governance attestations and privacy-preserving eligibility where useful.",
  },
  {
    phase: "5",
    title: "Scale only after proof",
    status: "Post-pilot",
    body: "Measure units enabled, rent discount, affordability years locked, capital mobilised and covenant compliance before launching a broader product.",
  },
];

export const keyMetrics = [
  "Affordable units enabled per €1m Fair Squares capital",
  "Rent discount versus local market or regulatory benchmark",
  "Affordability years contractually locked",
  "Project financing gap closed",
  "Months accelerated versus delayed/cancelled baseline",
  "Capital mobilised alongside Fair Squares",
  "Covenant compliance and reporting completeness",
];
