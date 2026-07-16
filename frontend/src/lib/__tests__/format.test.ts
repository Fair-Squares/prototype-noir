import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDateTime,
  formatEur,
  formatPct,
  formatPctFromBps,
  formatRelative,
  formatShares,
} from "../format";

describe("format — canonical D7 English formatting", () => {
  it("formats whole euros by default (protocol money is whole-EUR)", () => {
    expect(formatEur(1281)).toBe("€1,281");
    expect(formatEur(0)).toBe("€0");
    expect(formatEur(500_000)).toBe("€500,000");
  });

  it("formats price-like euros at the requested precision", () => {
    expect(formatEur(1281.5, 2)).toBe("€1,281.50");
    expect(formatEur(1.281, 4)).toBe("€1.2810");
  });

  it("formats shares with separators, up to 4 dp, trimmed", () => {
    expect(formatShares(780.5)).toBe("780.5");
    expect(formatShares(12_000)).toBe("12,000");
    expect(formatShares(0.12345)).toBe("0.1235");
  });

  it("formats counts as integers", () => {
    expect(formatCount(3)).toBe("3");
    expect(formatCount(1_000)).toBe("1,000");
  });

  it("formats percentages at 1 dp by default", () => {
    expect(formatPct(3)).toBe("3.0%");
    expect(formatPct(3.25)).toBe("3.3%");
  });

  it("converts basis points at the edge — bps never reaches the UI", () => {
    expect(formatPctFromBps(300)).toBe("3.0%");
    expect(formatPctFromBps(500, 0)).toBe("5%");
  });

  it("formats absolute date-times compactly", () => {
    expect(formatDateTime(new Date("2026-07-12T14:05:00"))).toBe("12 Jul 2026, 14:05");
  });

  it("formats relative time in minutes/hours/days", () => {
    const now = new Date("2026-07-12T12:00:00");
    expect(formatRelative(new Date("2026-07-12T12:30:00"), now)).toBe("in 30 minutes");
    expect(formatRelative(new Date("2026-07-12T09:00:00"), now)).toBe("3 hours ago");
    expect(formatRelative(new Date("2026-07-14T12:00:00"), now)).toBe("in 2 days");
  });
});
