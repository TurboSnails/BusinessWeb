import { describe, it, expect } from "vitest";
import { calculateMultiple, calculatePeg } from "./multiples";

describe("relative valuation", () => {
  it("calculates independent share values for four multiples", () => {
    expect(
      calculateMultiple({ method: "pe", metric: 2, multiple: 20 }).price,
    ).toBe(40);
    expect(calculatePeg(40, 0.4)).toBe(1);
    expect(
      calculateMultiple({ method: "peg", metric: 2, multiple: 1, growth: 0.4 })
        .price,
    ).toBe(80);
    expect(
      calculateMultiple({
        method: "ps",
        metric: 1000,
        multiple: 2,
        shares: 100,
      }).price,
    ).toBe(20);
    expect(
      calculateMultiple({ method: "pb", metric: 10, multiple: 0.8 }).price,
    ).toBe(8);
  });
  it("distinguishes missing values from invalid and inapplicable values", () => {
    expect(
      calculateMultiple({ method: "pe", metric: null, multiple: 20 }).status,
    ).toBe("missingData");
    expect(
      calculateMultiple({ method: "pe", metric: -2, multiple: 20 }).status,
    ).toBe("notApplicable");
    expect(
      calculateMultiple({ method: "peg", metric: 2, multiple: 1, growth: 0 })
        .status,
    ).toBe("notApplicable");
    expect(
      calculateMultiple({ method: "pb", metric: -10, multiple: 1 }).status,
    ).toBe("notApplicable");
    expect(
      calculateMultiple({ method: "ps", metric: 100, multiple: 1, shares: 0 })
        .status,
    ).toBe("invalidInput");
    expect(
      calculateMultiple({ method: "pe", metric: 2, multiple: Infinity }).status,
    ).toBe("invalidInput");
  });
  it("labels future prices and discounts only when a return rate is supplied", () => {
    const result = calculateMultiple({
      method: "pe",
      metric: 2,
      multiple: 20,
      years: 1,
      requiredReturn: 0.1,
    });
    expect(result.price).toBe(40);
    expect(result.presentPrice).toBeCloseTo(36.363636);
  });
});
