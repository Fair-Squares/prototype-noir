import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_PROPOSAL_ID,
  DEMO_STEPS,
  deriveDemoStage,
  demoStepIndex,
  previewRentShare,
  type DemoSnapshot,
} from "../demoJourney";
import {
  simCastVote,
  simClaimDistribution,
  simClaimRent,
  simDemoCloseVoteAndFund,
  simDemoCollectRent,
  simDeposit,
  simGetDemoSnapshot,
  simGetPortfolio,
  simReinvestRent,
  simResetDemo,
  simSetKYCVerified,
} from "../simulationStore";

function snapshot(overrides: Partial<DemoSnapshot> = {}): DemoSnapshot {
  const base: DemoSnapshot = {
    account: { index: 4, alias: "test4", address: "0xdemo" },
    verified: true,
    eurBalance: 15_000,
    deposited: 1_000,
    shares: 0,
    totalShares: 3_100,
    rorBps: 300,
    proposal: {
      id: 0,
      title: "Maashaven Wonen — Rotterdam",
      amount: 210_000,
      yesVotes: 1,
      noVotes: 0,
      quorumRequired: 2,
      status: 0,
      votingOpen: true,
      distributionOpened: false,
    },
    hasVoted: false,
    sharesClaimable: 0,
    hasClaimedShares: false,
    monthlyRent: 525,
    rentEarned: 0,
    rentClaimable: 0,
    rentWithdrawn: 0,
    rentReinvested: 0,
  };
  return { ...base, ...overrides };
}

const funded = { ...snapshot().proposal, status: 3, distributionOpened: true };

describe("deriveDemoStage", () => {
  it.each<[string, Partial<DemoSnapshot>, string]>([
    ["unverified", { verified: false, deposited: 0 }, "verify"],
    ["verified, nothing invested", { deposited: 0 }, "invest"],
    ["invested, vote open", {}, "vote"],
    ["invested, window passed without a vote", { proposal: { ...snapshot().proposal, votingOpen: false } }, "vote_expired"],
    ["voted, vote still open", { hasVoted: true }, "fund_home"],
    ["vote rejected", { hasVoted: true, proposal: { ...snapshot().proposal, status: 2 } }, "rejected"],
    ["approved, not yet bought", { hasVoted: true, proposal: { ...snapshot().proposal, status: 1 } }, "fund_home"],
    ["bought, shares unclaimed", { proposal: funded, sharesClaimable: 299 }, "claim_shares"],
    ["shares claimed, no rent yet", { proposal: funded, hasClaimedShares: true, shares: 299 }, "collect_rent"],
    ["rent waiting", { proposal: funded, hasClaimedShares: true, shares: 299, rentEarned: 46, rentClaimable: 46 }, "use_rent"],
    ["rent taken", { proposal: funded, hasClaimedShares: true, shares: 299, rentEarned: 46, rentWithdrawn: 46 }, "done"],
  ])("%s → %s", (_name, overrides, expected) => {
    expect(deriveDemoStage(snapshot(overrides))).toBe(expected);
  });

  it("maps every stage onto the five chapters, and done past the end", () => {
    expect(demoStepIndex("verify")).toBe(0);
    expect(demoStepIndex("fund_home")).toBe(2);
    expect(demoStepIndex("use_rent")).toBe(4);
    expect(demoStepIndex("done")).toBe(DEMO_STEPS.length);
  });
});

describe("previewRentShare", () => {
  it("is the pro-rata slice of the month's rent", () => {
    expect(previewRentShare(525, 299, 3_399)).toBe(46);
    expect(previewRentShare(525, 0, 0)).toBe(0);
  });
});

describe("guided demo against the simulation store", () => {
  beforeEach(() => simResetDemo());

  it("walks verify → invest → vote → own → earn on the featured home", () => {
    const start = simGetDemoSnapshot();
    const me = start.account.address;
    expect(start.proposal.id).toBe(DEMO_PROPOSAL_ID);
    expect(deriveDemoStage(start)).toBe("verify");

    simSetKYCVerified(me);
    expect(deriveDemoStage(simGetDemoSnapshot())).toBe("invest");

    expect(simDeposit(me, 1_000)).toEqual({ success: true });
    expect(deriveDemoStage(simGetDemoSnapshot())).toBe("vote");

    expect(simCastVote(me, DEMO_PROPOSAL_ID, true)).toEqual({ success: true });
    expect(deriveDemoStage(simGetDemoSnapshot())).toBe("fund_home");

    expect(simDemoCloseVoteAndFund()).toEqual({ success: true, approved: true });
    const bought = simGetDemoSnapshot();
    expect(bought.proposal.status).toBe(3);
    expect(deriveDemoStage(bought)).toBe("claim_shares");
    expect(bought.sharesClaimable).toBeGreaterThan(0);

    const claimed = simClaimDistribution(DEMO_PROPOSAL_ID, me);
    expect(claimed.claimedAmount).toBe(bought.sharesClaimable);
    // Regression: €1,000 in must never show as €61,665 of shares. Shares are
    // carved out of the deposit at purchase price, so they are worth at most
    // what went in.
    const held = simGetPortfolio(me);
    expect(held.shareValueEur).toBe(held.balance * 1);
    expect(held.shareValueEur).toBeLessThanOrEqual(held.depositedAmount);
    const owning = simGetDemoSnapshot();
    expect(deriveDemoStage(owning)).toBe("collect_rent");

    // ROR 3% of €210,000 a year → €525 a month, inside the 3.5% covenant cap.
    expect(owning.monthlyRent).toBe(525);
    const expectedSlice = previewRentShare(owning.monthlyRent, owning.shares, owning.totalShares);
    expect(simDemoCollectRent()).toEqual({ success: true, amount: 525 });
    const earning = simGetDemoSnapshot();
    expect(deriveDemoStage(earning)).toBe("use_rent");
    expect(earning.rentClaimable).toBe(expectedSlice);

    const eurBefore = simGetPortfolio(me).eurBalance;
    expect(simClaimRent(me)).toEqual({ success: true, claimed: expectedSlice });
    expect(simGetPortfolio(me).eurBalance).toBe(eurBefore + expectedSlice);
    expect(deriveDemoStage(simGetDemoSnapshot())).toBe("done");
  });

  it("reinvesting rent also completes the tour and grows the stake", () => {
    const me = simGetDemoSnapshot().account.address;
    simSetKYCVerified(me);
    simDeposit(me, 5_000);
    simCastVote(me, DEMO_PROPOSAL_ID, true);
    simDemoCloseVoteAndFund();
    simClaimDistribution(DEMO_PROPOSAL_ID, me);
    simDemoCollectRent();
    const { rentClaimable } = simGetDemoSnapshot();
    expect(simReinvestRent(me)).toEqual({ success: true, reinvested: rentClaimable });
    const after = simGetDemoSnapshot();
    expect(after.deposited).toBe(5_000 + rentClaimable);
    expect(deriveDemoStage(after)).toBe("done");
  });

  it("a no vote ties the ballot and the home is not bought", () => {
    const me = simGetDemoSnapshot().account.address;
    simSetKYCVerified(me);
    simDeposit(me, 500);
    simCastVote(me, DEMO_PROPOSAL_ID, false);
    expect(simDemoCloseVoteAndFund()).toEqual({ success: true, approved: false });
    expect(deriveDemoStage(simGetDemoSnapshot())).toBe("rejected");
    expect(simDemoCollectRent().success).toBe(false);
  });

  it("restarting wipes the persona's progress and reopens the vote", () => {
    const me = simGetDemoSnapshot().account.address;
    simSetKYCVerified(me);
    simDeposit(me, 500);
    simResetDemo();
    const fresh = simGetDemoSnapshot();
    expect(fresh.verified).toBe(false);
    expect(fresh.deposited).toBe(0);
    expect(fresh.proposal.votingOpen).toBe(true);
  });
});
