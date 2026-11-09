import { describe, it, expect } from "vitest";
import {
  slugifyTitle,
  getProjectDossier,
  aggregateImpact,
  modelledRorRent,
  SMALL_DEPOSITOR_FLOOR_BPS,
  SMALL_DEPOSITOR_FLOOR_PCT,
  CAPPED_RETURN_PCT,
  MODELLED_EXAMPLE_ACQUISITION_EUR,
} from "@/lib/projectDossier";

describe("slugifyTitle", () => {
  it("slugifies the seeded proposal title", () => {
    expect(slugifyTitle("Maashaven Wonen — Rotterdam")).toBe("maashaven-wonen-rotterdam");
  });

  it("strips combining accents and trims edge dashes", () => {
    expect(slugifyTitle("  Café Néckär!  ")).toBe("cafe-neckar");
  });
});

describe("getProjectDossier", () => {
  it("resolves the seeded dossier by proposal id", () => {
    const d = getProjectDossier({ id: 0, title: "anything at all" });
    expect(d).not.toBeNull();
    expect(d?.name).toBe("Maashaven Wonen — Rotterdam");
  });

  it("resolves by title slug when the id does not match", () => {
    const d = getProjectDossier({ id: 99, title: "Maashaven Wonen — Rotterdam" });
    expect(d?.name).toBe("Maashaven Wonen — Rotterdam");
  });

  it("returns null (never an invented dossier) for an unknown project", () => {
    expect(getProjectDossier({ id: 99, title: "Totally Unknown Project" })).toBeNull();
  });
});

describe("aggregateImpact", () => {
  it("is all-zero with the real floor surfaced when nothing is funded", () => {
    const agg = aggregateImpact([{ id: 0, title: "Maashaven Wonen", status: 0 }]);
    expect(agg.projectsFunded).toBe(0);
    expect(agg.homesEnabled).toBe(0);
    expect(agg.hasModelledImpact).toBe(false);
    // The small-depositor floor is a REAL on-chain parameter, surfaced regardless.
    expect(agg.smallDepositorFloorPct).toBe(30);
  });

  it("counts a funded (executed) project's modelled impact", () => {
    const agg = aggregateImpact([{ id: 0, title: "Maashaven Wonen", status: 3 }]);
    expect(agg.projectsFunded).toBe(1);
    expect(agg.homesEnabled).toBe(20);
    // affordable-home-years = affordableHomes (20) × covenant lockYears (20).
    expect(agg.affordabilityYears).toBe(400);
    expect(agg.gapClosedEur).toBe(650_000);
    expect(agg.hasModelledImpact).toBe(true);
  });

  it("counts a project whose distribution is open even if not yet executed", () => {
    const agg = aggregateImpact([
      { id: 0, title: "Maashaven Wonen", status: 0, distributionOpened: true },
    ]);
    expect(agg.projectsFunded).toBe(1);
  });

  it("ignores funded proposals that have no authored dossier", () => {
    const agg = aggregateImpact([{ id: 99, title: "Unknown", status: 3 }]);
    expect(agg.projectsFunded).toBe(0);
    expect(agg.hasModelledImpact).toBe(false);
  });
});

describe("modelledRorRent", () => {
  // The canonical worked example (CLAUDE.md + the HousingFund Noir test
  // test_expected_rent_from_ror_and_acquisition): a €500,000 home at ROR 3%
  // yields €15,000/yr -> €1,250/mo, flowing fully to investors.
  it("matches the on-chain ROR rent example at 3%", () => {
    const r = modelledRorRent(500_000, 3);
    expect(r.annualRentEur).toBe(15_000);
    expect(r.monthlyRentEur).toBe(1_250);
    expect(r.rorPct).toBe(3);
  });

  it("defaults to the modelled capped-return percentage", () => {
    const r = modelledRorRent(MODELLED_EXAMPLE_ACQUISITION_EUR);
    expect(r.rorPct).toBe(CAPPED_RETURN_PCT);
    expect(r.annualRentEur).toBe(Math.round((500_000 * CAPPED_RETURN_PCT) / 100));
  });

  it("never returns negative rent for a negative acquisition value", () => {
    expect(modelledRorRent(-100, 3).annualRentEur).toBe(0);
  });
});

describe("equity constants", () => {
  it("mirror the on-chain small-pool floor", () => {
    // SMALL_DEPOSITOR_FLOOR_BPS mirrors the contract's SMALL_POOL_BPS (3000 = 30%).
    expect(SMALL_DEPOSITOR_FLOOR_BPS).toBe(3000);
    expect(SMALL_DEPOSITOR_FLOOR_PCT).toBe(30);
  });
});
