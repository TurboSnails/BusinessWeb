import { describe, expect, it } from "vitest";
import { fcfYield, peerStats, revenueCagr } from "./peers";
import type { PrefillItem } from "./autofill";

const YI = 1e8;
const co = (c: string, fcf: number, revs: number[], extra: Partial<PrefillItem> = {}): PrefillItem => ({
  m: "cn", c, n: `公司${c}`, g: ["沪深300"], px: 10, pxDate: "2026-10-19", ccy: "CNY", fy: "2025-12-31", ind: "食品饮料",
  years: revs.map((r, i) => [String(2025 - i), r * YI, (fcf + 10) * YI, 10 * YI] as PrefillItem["years"][number]),
  cash: 0, inv: 0, debt: 0, shares: 10 * YI, interest: 0, pretax: 0, tax: 0, ebitda: 0, ni: 0, beta: 1, betaRaw: 1, betaWeeks: 104, src: "", at: "", ...extra,
});

describe("同行比较", () => {
  it("收益率 = 最近一年 FCF ÷ 市值；增速为营收复合增速；金融企业排除", () => {
    expect(fcfYield(co("1", 5, [110, 100, 90]))).toBeCloseTo(5, 6);
    expect(revenueCagr(co("1", 5, [121, 110, 100]))).toBeCloseTo(10, 6);
    expect(fcfYield(co("1", 5, [110, 100, 90], { fin: true }))).toBeNull();
    expect(revenueCagr(co("1", 5, [110, 100]))).toBeNull();
  });
  it("同市场同行业内按收益率排名，给出中位数；同行不足4家不比较", () => {
    const items = [co("A", 8, [130, 110, 100]), co("B", 6, [100, 100, 100]), co("SELF", 5, [121, 110, 100]), co("C", 3, [100, 95, 90]),
      co("D", 9, [100, 100, 100], { ind: "银行" }), co("E", 9, [100, 100, 100], { m: "hk" })];
    const s = peerStats(items, items[2])!;
    expect(s.count).toBe(4);
    expect(s.rank).toBe(3);
    expect(s.medianYield).toBeCloseTo(5.5, 6);
    expect(s.rows.map((r) => r.code)).toEqual(["A", "B", "SELF", "C"]);
    expect(peerStats(items.slice(0, 3), items[2])).toBeNull();
    expect(peerStats(items, { ...items[2], ind: undefined })).toBeNull();
  });
});
