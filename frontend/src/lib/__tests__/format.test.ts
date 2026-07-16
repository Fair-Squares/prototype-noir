import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDateTime,
  formatEUR,
  formatEURDecimals,
  formatFSFT,
  formatPct,
  formatPctFromBps,
  formatRelative,
} from "../format";

describe("format — canonical D7 English formatting", () => {
  it("formats whole euros by default (protocol money is whole-EUR)", () => {
    expect(formatEUR(1281)).toBe("€1,281");
    expect(formatEUR(0)).toBe("€0");
    expect(formatEUR(500_000)).toBe("€500,000");
  });

  it("formats price-like euros at the requested precision", () => {
    expect(formatEUR(1281.5, 2)).toBe("€1,281.50");
    expect(formatEUR(1.281, 4)).toBe("€1.2810");
    expect(formatEURDecimals(1281.5)).toBe("€1,281.50");
  });

  it("formats FSFT as a share count with the ticker, never as currency", () => {
    expect(formatFSFT(20_000)).toBe("20,000 FSFT");
    expect(formatFSFT(1)).toBe("1 FSFT");
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
