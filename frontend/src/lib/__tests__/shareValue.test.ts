import { describe, expect, it } from "vitest";
import { sharePriceFromBps, shareValueAtPurchase } from "../shareValue";

describe("share valuation at purchase price", () => {
  it("reads the issuance price from basis points, null before any home", () => {
    expect(sharePriceFromBps(10_000)).toBe(1);
    expect(sharePriceFromBps(10_250)).toBe(1.025);
    expect(sharePriceFromBps(0)).toBeNull();
    expect(() => sharePriceFromBps(-1)).toThrow();
  });

  it("values a holding at that price, never silently at €0", () => {
    expect(shareValueAtPurchase(299, 1)).toBe(299);
    expect(shareValueAtPurchase(0, null)).toBe(0);
    expect(shareValueAtPurchase(299, null)).toBeNull();
  });
});
