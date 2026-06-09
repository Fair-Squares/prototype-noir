import { describe, it, expect } from "vitest";
import { simGetRewardsOverview, REWARD_EMISSION_SCHEDULE } from "@/lib/simulationStore";

/**
 * Sim ↔ chain parity guard for the protocol-reward emission model.
 *
 * The Noir/TS boundary means the emission curve cannot be shared across the two
 * layers, so it is duplicated: `simulationStore.ts` (YEAR_SPLITS_BPS) MUST match
 * `contracts/protocol_rewards/src/main.nr` (`year_emission_bps`,
 * `total_distribution_pool`, `total_epochs`, and the 40/40/20 sub-pool split).
 * If either side drifts, this test and the Noir test
 * `test_epoch_target_follows_emission_schedule` should both be updated together.
 */
describe("reward emission parity (sim mirrors the on-chain schedule)", () => {
  const overview = simGetRewardsOverview();

  it("uses the same 8,000,000 distribution pool over 120 monthly epochs", () => {
    expect(overview.token.distributionPool).toBe(8_000_000);
    expect(overview.token.totalEpochs).toBe(120);
    expect(overview.token.years).toBe(10);
  });

  it("mirrors the contract's year_emission_bps curve (13,12,11,10,10,10,9,9,8,8 %)", () => {
    expect(overview.curveYearlyPercents).toEqual([13, 12, 11, 10, 10, 10, 9, 9, 8, 8]);
  });

  it("mirrors the contract's 40/40/20 deposit/fsft/governance sub-pool split", () => {
    expect(overview.weighting).toEqual({ deposit: 40, fsft: 40, governance: 20 });
  });

  it("derives the same epoch-0 emission ceiling as the on-chain get_epoch_target", () => {
    // Contract: epoch_emission_target = floor(floor(pool * bps / 10000) / 12).
    // Year 0 bps = 1300 -> yearly = 1,040,000 -> per-epoch = 86,666.
    const yearlyYear0 = overview.yearlySchedule[0].tokens;
    expect(yearlyYear0).toBe(1_040_000);
    expect(Math.floor(yearlyYear0 / 12)).toBe(86_666);
  });

  it("keeps the claim minimum at 1 (matches the deployed claim_min)", () => {
    expect(overview.claimMin).toBe(1);
  });

  it("emits a FLAT floor(floor(pool*bps/10000)/12) every epoch of a year (no remainder spreading)", () => {
    // The contract's epoch_emission_target is the same for all 12 epochs of a
    // year; the flooring dust stays unminted by design. A remainder-spreading
    // sim drifts from the chain inside each year (e.g. epoch 11: 86,674 vs
    // the contract's 86,666).
    const bps = [1300, 1200, 1100, 1000, 1000, 1000, 900, 900, 800, 800];
    expect(REWARD_EMISSION_SCHEDULE).toHaveLength(120);
    for (let epoch = 0; epoch < 120; epoch++) {
      const yearly = Math.floor((8_000_000 * bps[Math.floor(epoch / 12)]) / 10_000);
      expect(REWARD_EMISSION_SCHEDULE[epoch]).toBe(Math.floor(yearly / 12));
    }
  });
});
