import { describe, it, expect } from "vitest";
import type { Proposal } from "@/lib/contracts";
import {
  statusKindFor,
  votingWindowFor,
  isVotingEnded,
  displayStatus,
  quorumFor,
  proposalLabel,
} from "@/lib/proposalLifecycle";

// Minimal Proposal fixture. Only the fields the lifecycle helpers read are set;
// the rest are filled with harmless defaults and the whole thing is cast to the
// real Proposal type (imported as a type only, so contracts.ts is never loaded).
function mkProposal(overrides: Partial<Proposal>): Proposal {
  return {
    id: 0,
    status: 0,
    yesVotes: 0,
    noVotes: 0,
    deadline: 100,
    ...overrides,
  } as Proposal;
}

describe("statusKindFor", () => {
  it("maps the four on-chain statuses", () => {
    expect(statusKindFor(0)).toBe("active");
    expect(statusKindFor(1)).toBe("passed");
    expect(statusKindFor(2)).toBe("failed");
    expect(statusKindFor(3)).toBe("executed");
  });

  it("falls back to 'pending' for unknown status codes", () => {
    expect(statusKindFor(99)).toBe("pending");
  });
});

describe("votingWindowFor", () => {
  it("reports 'unknown' when the current block height is absent", () => {
    const w = votingWindowFor(mkProposal({ deadlineBlock: 50, currentBlock: undefined }));
    expect(w.unknown).toBe(true);
    expect(w.closed).toBe(false);
    expect(w.remainingLabel).toBe("Unknown");
  });

  it("computes blocks remaining while open", () => {
    const w = votingWindowFor(mkProposal({ deadlineBlock: 50, currentBlock: 42 }));
    expect(w.blocksRemaining).toBe(8);
    expect(w.closed).toBe(false);
    expect(w.remainingLabel).toBe("8 blocks");
  });

  it("uses the singular label for exactly one block", () => {
    const w = votingWindowFor(mkProposal({ deadlineBlock: 50, currentBlock: 49 }));
    expect(w.remainingLabel).toBe("1 block");
  });

  it("is closed (never negative) once the deadline block passes", () => {
    const w = votingWindowFor(mkProposal({ deadlineBlock: 50, currentBlock: 60 }));
    expect(w.blocksRemaining).toBe(0);
    expect(w.closed).toBe(true);
    expect(w.remainingLabel).toBe("Closed");
  });

  it("falls back to `deadline` when `deadlineBlock` is absent", () => {
    const w = votingWindowFor(mkProposal({ deadline: 30, currentBlock: 10 }));
    expect(w.deadlineBlock).toBe(30);
    expect(w.blocksRemaining).toBe(20);
  });
});

describe("isVotingEnded / displayStatus", () => {
  it("flags a still-ACTIVE proposal whose window has closed", () => {
    const p = mkProposal({ status: 0, deadlineBlock: 50, currentBlock: 60 });
    expect(isVotingEnded(p)).toBe(true);
    expect(displayStatus(p)).toEqual({ kind: "pending", label: "Voting ended" });
  });

  it("does not flag an ACTIVE proposal still inside its window", () => {
    const p = mkProposal({ status: 0, deadlineBlock: 50, currentBlock: 10 });
    expect(isVotingEnded(p)).toBe(false);
    expect(displayStatus(p)).toEqual({ kind: "active" });
  });

  it("does not flag an already-resolved proposal as 'voting ended'", () => {
    const p = mkProposal({ status: 1, deadlineBlock: 50, currentBlock: 60 });
    expect(isVotingEnded(p)).toBe(false);
    expect(displayStatus(p)).toEqual({ kind: "passed" });
  });
});

describe("quorumFor", () => {
  it("derives totals and majority from raw vote counts", () => {
    const q = quorumFor(mkProposal({ yesVotes: 3, noVotes: 1, quorumRequired: 2 }));
    expect(q).toMatchObject({
      required: 2,
      total: 4,
      reached: true,
      yes: 3,
      no: 1,
      majorityYes: true,
    });
  });

  it("reports quorum not reached when total is below the requirement", () => {
    const q = quorumFor(mkProposal({ yesVotes: 0, noVotes: 1, quorumRequired: 5 }));
    expect(q.reached).toBe(false);
  });

  it("treats a tie as NOT a yes-majority (strict-majority rule)", () => {
    const q = quorumFor(mkProposal({ yesVotes: 2, noVotes: 2, quorumRequired: 1 }));
    expect(q.majorityYes).toBe(false);
  });
});

describe("proposalLabel", () => {
  it("uses the id only — titles are never on-chain", () => {
    expect(proposalLabel(mkProposal({ id: 7 }))).toBe("Housing proposal #7");
  });
});
