/**
 * Project-finance dossier — the modelled metadata layer behind the §2.0 "deal
 * room" / project dossier (see docs/FUTURE_DEVELOPMENT_PLAN.md §2.0, §9.2 D1).
 *
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM THE CONTRACTS
 * ---------------------------------------------------------
 * The protocol commits only a few things to chain for a project: the capital
 * ask (a governance proposal), the vote tally, the distribution pool, and the
 * property deed. The *project-finance* facts a housing partner actually wants
 * to see — the documented financing gap (`onrendabele top`), the full capital
 * stack (senior bank debt · public subsidy · member/co-op capital · the Fair
 * Squares capped-return layer), the affordability covenant, milestones, and
 * impact — are NOT on-chain (confirmed: HousingFund has no covenant/reserve
 * fields). So this file holds them as an explicit, *modelled* sidecar that the
 * UI overlays on the real proposal, every figure of which is tagged
 * "Modelled for demo" in the components (`<ModelledChip />`). We never present
 * a modelled number as live — that honesty is itself the pitch to this audience
 * (FUTURE_DEVELOPMENT_PLAN.md §9.0).
 *
 * The one capital-stack tranche that DOES have an on-chain counterpart is the
 * Fair Squares capped-return layer: on the demo network it is represented by
 * the proposal's on-chain `amount`. The dossier components draw that bridge
 * explicitly rather than mixing modelled and real euros in one number.
 *
 * Content is illustrative (a representative Rotterdam wooncoöperatie
 * transformation), not the actual finances of any named real partner.
 */

// ── Real on-chain parameters (NOT modelled) ───────────────────────────────────

/**
 * The small-depositor floor reserved out of every distribution, in basis points.
 * This mirrors `SMALL_POOL_BPS` in contracts/housing_fund/src/main.nr (3000) and
 * is a genuine on-chain equity parameter — surfaced WITHOUT a "modelled" tag.
 */
export const SMALL_DEPOSITOR_FLOOR_BPS = 3000;
export const SMALL_DEPOSITOR_FLOOR_PCT = SMALL_DEPOSITOR_FLOOR_BPS / 100; // 30

// ── Modelled policy defaults (per docs/pilot-term-sheet.md, NOT yet in-circuit)

/**
 * The capped net annual return to investors — the "Return on Rent" (ROR), the
 * master parameter of the model (see CLAUDE.md → "Economic model: rent, return &
 * NAV"). Rent is defined as ROR × acquisition value (e.g. ~3% of a €500K home →
 * €1,250/mo), paid monthly, and flows FULLY to investors. The "cap" is that the
 * rent is cost-based / below market, so the household gets the affordability
 * benefit directly — there is NO surplus-to-reserve skim. ~3–4% per the pilot
 * term sheet; NOT yet enforced in the HousingFund circuit, so anywhere it drives
 * a number on screen the UI must label it modelled.
 */
export const CAPPED_RETURN_PCT = 3.5;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrancheKind =
  | "senior-debt"
  | "subsidy"
  | "member-capital"
  | "guarantee"
  | "fair-squares";

export interface CapitalTranche {
  key: string;
  label: string;
  amountEur: number;
  kind: TrancheKind;
  /** One-line description of the source / its terms. */
  note: string;
  /**
   * True for the tranche Fair Squares supplies — the documented financing gap
   * (`onrendabele top`). On the demo network this maps to the on-chain proposal
   * amount, so components can draw the modelled↔on-chain bridge.
   */
  isFairSquares?: boolean;
}

export interface AffordabilityCovenant {
  rentBand: string;
  targetGroup: string;
  /** Years the affordability covenant locks the homes. */
  lockYears: number;
  /** Capped net annual investor return (%). */
  cappedReturnPct: number;
}

export type MilestoneStatus = "done" | "active" | "upcoming";

export interface ProjectMilestone {
  key: string;
  label: string;
  /** Human period, e.g. "Q3 2026". */
  when: string;
  status: MilestoneStatus;
}

export interface ProjectImpact {
  /** Net-new / re-enabled affordable homes (the headline KPI). */
  homesEnabled: number;
  affordableHomes: number;
  /** Years the covenant protects affordability. */
  affordabilityYears: number;
  /** Modelled rent discount vs. local market, %. */
  rentDiscountPct: number;
}

/** A sensitive detail row — only shown to verified / authorised viewers. */
export interface SensitiveRow {
  label: string;
  value: string;
  note?: string;
}

export interface ProjectDossier {
  /** How this dossier resolves to an on-chain proposal. Any match wins. */
  match: { proposalIds?: number[]; titleSlugs?: string[] };
  name: string;
  location: string;
  /** One-paragraph plain-language summary, housing-first. */
  summary: string;
  /** Total modelled project budget. */
  totalBudgetEur: number;
  /** Documented financing gap (`onrendabele top`) Fair Squares helps close. */
  financingGapEur: number;
  capitalStack: CapitalTranche[];
  covenant: AffordabilityCovenant;
  milestones: ProjectMilestone[];
  impact: ProjectImpact;
  /** Role-gated detail (member capital, eligibility evidence, underwriting). */
  sensitive: SensitiveRow[];
  /** Rent-to-equity narrative (the tenant differentiator, §3.4 / D3). */
  rentToEquity: string;
}

// ── The registry ──────────────────────────────────────────────────────────────

/**
 * Authored dossiers. For the demo there is one — a representative Rotterdam
 * wooncoöperatie transformation. The seed (`scripts/seed-fsft.sh`) creates the
 * matching proposal (title "Maashaven Wonen — Rotterdam", id 0 on a fresh
 * bootstrap); the legacy "Seed asset" title and id 0 are also matched so an
 * already-seeded network still resolves.
 */
const DOSSIERS: ProjectDossier[] = [
  {
    match: {
      proposalIds: [0],
      titleSlugs: ["maashaven-wonen-rotterdam", "maashaven-wonen", "seed-asset"],
    },
    name: "Maashaven Wonen — Rotterdam",
    location: "Rotterdam-Zuid, Netherlands",
    summary:
      "A proposed housing co-operative in Rotterdam with 20 homes for key workers. " +
      "Fair Squares would help close its funding gap.",
    totalBudgetEur: 4_600_000,
    financingGapEur: 650_000,
    capitalStack: [
      {
        key: "senior",
        label: "Senior bank debt",
        amountEur: 2_900_000,
        kind: "senior-debt",
        note: "Commercial mortgage, WSW-style guarantee, first claim on the asset.",
      },
      {
        key: "subsidy",
        label: "Municipal / public subsidy",
        amountEur: 600_000,
        kind: "subsidy",
        note: "Direct corporation subsidy for documented affordable supply.",
      },
      {
        key: "member",
        label: "Member / co-op capital",
        amountEur: 450_000,
        kind: "member-capital",
        note: "Resident members' own contributions into the wooncoöperatie.",
      },
      {
        key: "fairsquares",
        label: "Fair Squares capped-return layer",
        amountEur: 650_000,
        kind: "fair-squares",
        note: "The onrendabele top: capped-return capital pooled from KYC'd savers, covenant-locked.",
        isFairSquares: true,
      },
    ],
    covenant: {
      rentBand: "Mid-market, capped near the social-rent ceiling (~€880/month, indexed)",
      targetGroup:
        "Key workers — healthcare, education, public safety; household income €38k–€52k",
      lockYears: 20,
      cappedReturnPct: CAPPED_RETURN_PCT,
    },
    milestones: [
      { key: "acq", label: "Site acquired", when: "Q1 2026", status: "done" },
      { key: "permit", label: "Permit & design", when: "Q3 2026", status: "active" },
      { key: "build", label: "Transformation works", when: "2027", status: "upcoming" },
      { key: "lease", label: "Lease-up & stabilisation", when: "Q2 2028", status: "upcoming" },
      { key: "lock", label: "Affordability covenant locked", when: "2028–2048", status: "upcoming" },
    ],
    impact: {
      homesEnabled: 20,
      affordableHomes: 20,
      affordabilityYears: 20,
      rentDiscountPct: 28,
    },
    sensitive: [
      {
        label: "Member capital — individual commitments",
        value: "12 members · €18k–€60k each",
        note: "Per-member amounts are confidential; only the aggregate is public.",
      },
      {
        label: "Key-worker eligibility evidence",
        value: "Employer attestation + income band, proven privately",
        note: "Verified via a private KYC credential — documents never leave the holder.",
      },
      {
        label: "Underwriting notes",
        value: "DSCR 1.28 · stressed at +200bps · 8% cost contingency",
      },
    ],
    rentToEquity:
      "Tenants in this project accrue a small Fund Share slice from each rent " +
      "payment (rent-to-equity), so the people living here build equity in the " +
      "building they live in — privately. Shown on the roadmap; not yet live.",
  },
];

// ── Resolution + aggregation ──────────────────────────────────────────────────

/** Lowercase, hyphenated slug used to match a proposal title to a dossier. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve the dossier for a proposal, or null if none is authored for it.
 * Matches by explicit proposal id first, then by title slug. Returning null
 * (rather than inventing a generic dossier) keeps the honesty contract: a
 * project either has a dossier on file or it doesn't.
 */
export function getProjectDossier(proposal: { id: number; title: string }): ProjectDossier | null {
  const slug = slugifyTitle(proposal.title);
  for (const dossier of DOSSIERS) {
    if (dossier.match.proposalIds?.includes(proposal.id)) return dossier;
    if (dossier.match.titleSlugs?.includes(slug)) return dossier;
  }
  return null;
}

export function getAllDossiers(): ProjectDossier[] {
  return DOSSIERS;
}

/** A proposal is "funded" once it is executed or its distribution is open. */
function isFundedProposal(p: { status: number; distributionOpened?: boolean }): boolean {
  return p.status === 3 || Boolean(p.distributionOpened);
}

export interface AggregateImpact {
  /** Funded projects that have a dossier. */
  projectsFunded: number;
  /** Sum of homes enabled across funded dossier projects (modelled). */
  homesEnabled: number;
  /** Sum of affordable-home-years (homes × covenant years) (modelled). */
  affordabilityYears: number;
  /** Sum of financing gaps closed across funded projects (modelled). */
  gapClosedEur: number;
  /** Real on-chain equity parameter — % of every distribution floored to small depositors. */
  smallDepositorFloorPct: number;
  /** True when at least one funded project resolved to a dossier. */
  hasModelledImpact: boolean;
}

/**
 * Fund-wide impact for the impact strip (D4). Homes / affordability-years / gap
 * are MODELLED (from authored dossiers attached to funded proposals); the
 * small-depositor floor is REAL (an on-chain parameter). The strip tags the
 * modelled figures accordingly.
 */
export function aggregateImpact(
  proposals: Array<{ id: number; title: string; status: number; distributionOpened?: boolean }>
): AggregateImpact {
  let projectsFunded = 0;
  let homesEnabled = 0;
  let affordabilityYears = 0;
  let gapClosedEur = 0;

  for (const proposal of proposals) {
    if (!isFundedProposal(proposal)) continue;
    const dossier = getProjectDossier(proposal);
    if (!dossier) continue;
    projectsFunded += 1;
    homesEnabled += dossier.impact.homesEnabled;
    affordabilityYears += dossier.impact.affordableHomes * dossier.covenant.lockYears;
    gapClosedEur += dossier.financingGapEur;
  }

  return {
    projectsFunded,
    homesEnabled,
    affordabilityYears,
    gapClosedEur,
    smallDepositorFloorPct: SMALL_DEPOSITOR_FLOOR_PCT,
    hasModelledImpact: projectsFunded > 0,
  };
}

/** Illustrative acquisition value for the worked ROR rent example (modelled). */
export const MODELLED_EXAMPLE_ACQUISITION_EUR = 500_000;

/**
 * The ROR-based rent for a home of a given acquisition value, MODELLED.
 *
 * The canonical model (CLAUDE.md): rent = ROR × acquisition_value, paid monthly,
 * flowing FULLY to the investor pool. This illustrates that cost-based rent — it
 * does NOT change the real on-chain distribution (which still mints each holder
 * their full FIFO + small-floor share). Rendered under a "Modelled for demo"
 * chip. There is no investor/reserve split: the full rent goes to investors and
 * the affordability is the below-market rent the household pays.
 */
export function modelledRorRent(
  acquisitionEur: number,
  rorPct: number = CAPPED_RETURN_PCT
): { annualRentEur: number; monthlyRentEur: number; rorPct: number } {
  const base = Math.max(0, acquisitionEur);
  // Floor per step, exactly like the on-chain math (ROR * value / 10000 / 12
  // with whole-EUR flooring) — the modelled mirror must round the same way.
  const annualRentEur = Math.floor((base * rorPct) / 100);
  const monthlyRentEur = Math.floor(annualRentEur / 12);
  return { annualRentEur, monthlyRentEur, rorPct };
}
