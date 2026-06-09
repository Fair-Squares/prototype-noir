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

  it("labels block deadlines via closesAtLabel ('block N')", () => {
    const w = votingWindowFor(mkProposal({ deadlineBlock: 1234, currentBlock: 42 }));
    expect(w.kind).toBe("block");
    expect(w.closesAtLabel).toBe("block 1,234");
  });

  // Simulation proposals carry wall-clock deadlines (unix seconds) and no
  // current block: the window must still open/close and never read as blocks.
  describe("timestamp deadlines (simulation mode)", () => {
    it("stays open before the wall-clock deadline, with a duration label", () => {
      const deadline = Math.floor(Date.now() / 1000) + 125; // ~2m05s out
      const w = votingWindowFor(mkProposal({ deadline, deadlineKind: "timestamp" }));
      expect(w.kind).toBe("timestamp");
      expect(w.unknown).toBe(false);
      expect(w.closed).toBe(false);
      expect(w.remainingLabel).toMatch(/^\d+m \d+s$/);
      // The closes-at label is a clock time, never "block <unix-timestamp>".
      expect(w.closesAtLabel).not.toMatch(/block/);
    });

    it("closes once the wall-clock deadline passes (so sim governance can finalise)", () => {
      const deadline = Math.floor(Date.now() / 1000) - 10;
      const p = mkProposal({ status: 0, deadline, deadlineKind: "timestamp" });
      const w = votingWindowFor(p);
      expect(w.closed).toBe(true);
      expect(w.remainingLabel).toBe("Closed");
      expect(isVotingEnded(p)).toBe(true);
      expect(displayStatus(p)).toEqual({ kind: "pending", label: "Voting ended" });
    });
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
    expect(displayStatus(p)).toEqual({ kind: "active", label: "Voting open" });
  });

  it("does not flag an already-resolved proposal as 'voting ended'", () => {
    const p = mkProposal({ status: 1, deadlineBlock: 50, currentBlock: 60 });
    expect(isVotingEnded(p)).toBe(false);
    expect(displayStatus(p)).toEqual({ kind: "passed", label: "Approved" });
  });
});

// Guard: every governance status must render with the ONE canonical, human
// vocabulary (CLAUDE.md "User-facing product rules"). Never the raw on-chain enum
// words (Active/Passed/Failed/Executed) — a first-time user reads these, and the
// same proposal must not read differently across routes.
describe("canonical governance vocabulary", () => {
  const CANONICAL = new Set([
    "Voting open",
    "Voting ended",
    "Approved",
    "Rejected",
    "Funded",
  ]);
  const RAW_ENUM = new Set(["Active", "Passed", "Failed", "Executed", "Pending"]);

  it("displayStatus always returns a label from the canonical set, never a raw enum word", () => {
    const cases: Proposal[] = [
      mkProposal({ status: 0, deadlineBlock: 50, currentBlock: 10 }), // Voting open
      mkProposal({ status: 0, deadlineBlock: 50, currentBlock: 60 }), // Voting ended
      mkProposal({ status: 1 }), // Approved
      mkProposal({ status: 2 }), // Rejected
      mkProposal({ status: 3 }), // Funded
    ];
    for (const p of cases) {
      const { label } = displayStatus(p);
      expect(CANONICAL.has(label)).toBe(true);
      expect(RAW_ENUM.has(label)).toBe(false);
    }
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
