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

export const researchSources: ResearchSource[] = [
  {
    title: "The effect of housing subsidies on new construction",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2025",
    url: "https://www.cpb.nl/de-effecten-van-subsidies-op-woningbouw",
    takeaway:
      "CPB warns that broad building subsidies often do not create many extra homes when land and permits are the real bottlenecks. In that situation, public money can leak into higher land prices instead of lower rents or more homes.",
    implication:
      "Fair Squares focuses on project-level gaps instead of generic subsidies: capital is connected to a specific project, fixed land terms and measurable affordability outcomes.",
  },
  {
    title: "How new housing affects affordability and fit",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/de-effecten-van-woningbouw-op-betaalbaarheid-en-vraaggerichtheid",
    takeaway:
      "For many middle-income households, the biggest help is simply more homes. CPB also notes that when land is scarce, smaller and more efficient homes can help more people than larger homes on the same land.",
    implication:
      "Fair Squares is best suited to projects that add usable affordable homes efficiently: transformations, building splits, rooftop additions and compact mid-rent apartments.",
  },
  {
    title: "A perspective on the housing market",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2026",
    url: "https://www.cpb.nl/publicatie/perspectief-op-de-woningmarkt",
    takeaway:
      "CPB argues that the housing market has to be viewed as one connected system. A measure that helps one group can make scarcity worse for another group if it only increases demand for limited homes.",
    implication:
      "Fair Squares is a supply-side tool. The public promise is not more bidding power, but helping specific affordable homes get built, transformed or preserved.",
  },
  {
    title: "The rent dilemma: affordability versus availability",
    publisher: "CPB Netherlands Bureau for Economic Policy Analysis",
    year: "2024",
    url: "https://www.cpb.nl/huurdilemma-betaalbaarheid-versus-beschikbaarheid",
    takeaway:
      "Rent caps can make homes cheaper for tenants who get them, but they can also make rental projects less attractive to owners and investors. That can reduce the number of available rental homes.",
    implication:
      "This is where Fair Squares fits: lower-return, mission-aligned capital can help capped-rent projects work without forcing rents back up to market level.",
  },
  {
    title: "Measures are needed to address a €19.4bn housing-corporation funding gap",
    publisher: "Dutch central government",
    year: "2026",
    url: "https://www.rijksoverheid.nl/actueel/nieuws/2026/01/29/maatregelen-nodig-tegen-tekort-woningcorporaties-van-%E2%82%AC-194-miljard",
    takeaway:
      "The Dutch government reports that housing corporations face a €19.4bn shortfall against €115bn of agreed investments through 2034. Without extra room, new-build, maintenance and sustainability targets are at risk.",
    implication:
      "Fair Squares can complement mission-driven operators with an extra capital layer tied to affordability, reporting and anti-speculation protections.",
  },
  {
    title: "900,000 new homes to meet growing demand",
    publisher: "Dutch central government",
    year: "current programme",
    url: "https://www.rijksoverheid.nl/onderwerpen/volkshuisvesting/nieuwe-woningen",
    takeaway:
      "The Netherlands aims to build 900,000 homes through 2030, with two-thirds intended to be affordable rental or affordable purchase homes.",
    implication:
      "Fair Squares belongs in the affordable part of that pipeline, especially where a small but difficult funding gap blocks a viable project.",
  },
  {
    title: "Primos forecast 2025",
    publisher: "ABF Research",
    year: "2025",
    url: "https://abfresearch.nl/publicaties/primos-prognose-2025/",
    takeaway:
      "ABF estimates the 2025 statistical housing shortage at roughly 396,000 homes, or 4.8% of the housing stock.",
    implication:
      "The shortage is urgent, but Fair Squares should stay disciplined: capital should be tied to additional homes, affordability years and clear public reporting.",
  },
];

export const fairSquaresDirection: FairSquaresDirection[] = [
  {
    title: "Bridge the affordability gap",
    body: "When rents are capped, a useful housing project can lose just enough income to become unfinanceable. Fair Squares fills that narrow gap with patient, capped-return capital.",
  },
  {
    title: "Fund homes, not speculation",
    body: "Capital is connected to real homes, fixed land/control terms and anti-speculation protections, so value is directed toward affordability rather than land-price inflation.",
  },
  {
    title: "Make affordability visible",
    body: "Each project should show the financing gap, homes enabled, rent level, affordability duration and reporting status in language anyone can understand.",
  },
  {
    title: "Open access for social investors",
    body: "Fair Squares is designed for people and organisations willing to accept capped returns in exchange for concrete, measurable housing outcomes.",
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
