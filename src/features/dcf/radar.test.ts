import { describe, expect, it } from "vitest";
import { radarRows } from "./radar";
import type { AutoDcf } from "./autoDcf";
import type { PrefillItem } from "./autofill";

const YI = 1e8;
const item = (c: string, fcf: number, extra: Partial<PrefillItem> = {}): PrefillItem => ({
  m: "cn", c, n: c, g: ["沪深300"], px: 10, pxDate: "", ccy: "CNY", fy: "2025-12-31", ind: "食品饮料",
  years: [["2025", 100 * YI, (fcf + 1) * YI, 1 * YI], ["2024", 95 * YI, (fcf + 1) * YI, 1 * YI], ["2023", 90 * YI, (fcf + 1) * YI, 1 * YI]],
  cash: 0, inv: 0, debt: 0, shares: 10 * YI, interest: 0, pretax: 0, tax: 0, ebitda: 0, ni: 0, beta: 1, betaRaw: 1, betaWeeks: 104, src: "", at: "", ...extra,
});
const dcf = (fair: number, extra: Partial<AutoDcf> = {}): AutoDcf => ({ status: "ok", fair, buyBelow: fair * 0.8, credibility: "high", current: 10, currency: "CNY", ...extra });

describe("机会雷达", () => {
  const items = [item("A", 9, { fyh: { now: 9, pct: 80, med: 5, lo: 2, hi: 10, n: 60 } }), item("B", 9, { fyh: { now: 9, pct: 30, med: 9, lo: 2, hi: 12, n: 60 } }), item("C", 2), item("D", 1), item("E", 9), item("F", 9)];
  const auto = new Map<string, AutoDcf>([
    ["cn:A", dcf(20)], ["cn:B", dcf(16, { credibility: "medium" })], ["cn:C", dcf(15)], ["cn:D", dcf(11)],
    ["cn:E", dcf(30, { credibility: "low" })], ["cn:F", dcf(40, { status: "financial", fair: null, buyBelow: null })],
  ]);
  const rows = radarRows(items, auto);
  it("只收低于买入参考价、可信度不为低、模型适用的公司", () => {
    expect(rows.map((r) => r.item.c).sort()).toEqual(["A", "B", "C"]);
  });
  it("按信号数排序：A 比历史与同行都便宜，B 只比同行便宜，C 两项都不满足", () => {
    expect(rows.map((r) => [r.item.c, r.score, r.cheapVsHistory, r.cheapVsPeers])).toEqual([
      ["A", 2, true, true], ["B", 1, false, true], ["C", 0, false, false],
    ]);
  });
});
