import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_ID } from "../demoJourney";
import {
  SIM_ACCOUNTS,
  simCastVote,
  simDemoCloseVoteAndFund,
  simDeposit,
  simGetFundStats,
  simGetPortfolio,
  simGetProperties,
  simGetProposals,
  simResetDemo,
  simSetKYCVerified,
} from "../simulationStore";

describe("simulation seed stays internally consistent", () => {
  beforeEach(() => simResetDemo());

  it("shares outstanding = capital spent on homes, held by the seeded holders", () => {
    const stats = simGetFundStats();
    const held = SIM_ACCOUNTS.reduce((sum, a) => sum + simGetPortfolio(a.address).balance, 0);
    expect(held).toBe(stats.totalSupply);
    // Issued at €1 per euro of purchase, so the two agree exactly.
    expect(stats.totalSupply * (stats.sharePriceEur ?? 0)).toBe(stats.totalAllocated);
  });

  it("the home that capital bought is owned by the fund", () => {
    const owned = simGetProperties();
    expect(owned.map((p) => p.valuationEur).reduce((a, b) => a + b, 0)).toBe(
      simGetFundStats().totalAllocated
    );
    expect(owned.every((p) => p.tokenId === p.proposalId + 1)).toBe(true);
  });

  it("seeded votes stay open for a day, not minutes after a cold start", () => {
    const now = Math.floor(Date.now() / 1000);
    const open = simGetProposals().filter((p) => p.status === 0);
    expect(open.length).toBeGreaterThan(0);
    for (const p of open) expect(p.deadline - now).toBeGreaterThan(23 * 60 * 60);
  });

  it("funding a home through the demo adds its deed", () => {
    const me = SIM_ACCOUNTS.find((a) => a.index === 4)!.address;
    simSetKYCVerified(me);
    simDeposit(me, 1_000);
    simCastVote(me, DEMO_PROPOSAL_ID, true);
    simDemoCloseVoteAndFund();
    expect(simGetProperties().some((p) => p.proposalId === DEMO_PROPOSAL_ID)).toBe(true);
  });
});
