import { describe, expect, it } from "vitest";
import { assess, credibility, scenarios } from "./assessment";
import { calculateSheetDcf } from "./engine";
import type { PrefillItem } from "./autofill";
import type { DcfSheetInput } from "./types";

const input = (over: Partial<DcfSheetInput> = {}): DcfSheetInput => ({
  company: "x", code: "x", market: "cn", currency: "CNY", moneyUnit: "yi", shareUnit: "yi", baseYear: 2025,
  baseFcf: 100, growth: 8, perpetualGrowth: 2.5, discountRate: 9, cash: 0, debt: 0, shares: 10, currentPrice: 100, ebitda: null,
  marketCap: null, beta: null, interestExpense: null, pretaxIncome: null, taxPaid: null, riskFreeRate: null, marketReturn: null, fadeYears: 5, ...over,
});
const YI = 1e8;
const steady = { years: [["2025", 0, 120 * YI, 20 * YI], ["2024", 0, 110 * YI, 20 * YI], ["2023", 0, 100 * YI, 20 * YI], ["2022", 0, 95 * YI, 20 * YI]] } as unknown as PrefillItem;

describe("估值判断", () => {
  it("三情景：悲观增速减半且折现+1%，乐观增速×1.5（最多+5点）且折现−1%，价格依次升高", () => {
    const [bear, base, bull] = scenarios(input());
    expect([bear.growth, bear.discountRate, bull.growth, bull.discountRate]).toEqual([4, 10, 12, 8]);
    expect(base.price).toBeCloseTo(calculateSheetDcf(input()).price!, 6);
    expect(bear.price!).toBeLessThan(base.price!);
    expect(bull.price!).toBeGreaterThan(base.price!);
    expect(scenarios(input({ growth: 14 }))[2].growth).toBe(19);
  });
  it("可信度：现金流稳定为高；有负现金流为低；手动填写为中", () => {
    expect(credibility(steady, 0.6).level).toBe("high");
    const neg = { years: [...steady.years.slice(0, 3), ["2022", 0, 5 * YI, 20 * YI]] } as unknown as PrefillItem;
    expect(credibility(neg, 0.6)).toMatchObject({ level: "low" });
    expect(credibility(null, 0.6).level).toBe("medium");
    expect(credibility(steady, 0.9).reasons.join()).toContain("终值占企业价值 90%");
  });
  it("买入参考价按可信度留安全边际，结论随现价位置变化", () => {
    const fair = calculateSheetDcf(input()).price!;
    const cheap = assess(input({ currentPrice: fair * 0.5 }), steady, null)!;
    expect(cheap.requiredMargin).toBe(0.2);
    expect(cheap.buyBelow).toBeCloseTo(fair * 0.8, 6);
    expect(cheap.tone).toBe("good");
    expect(assess(input({ currentPrice: fair * 0.9 }), steady, null)!.verdict).toContain("可列入观察");
    expect(assess(input({ currentPrice: fair * 10 }), steady, 25)!.verdict).toContain("市场隐含未来五年增速约 25.0%");
    expect(assess(input({ baseFcf: -5 }), steady, null)).toBeNull();
  });
});
