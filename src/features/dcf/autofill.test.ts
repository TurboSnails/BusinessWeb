import { describe, expect, it } from "vitest";
import { deriveAutoFill, impliedGrowth, searchPrefill, type PrefillItem, type PrefillLibrary } from "./autofill";
import { calculateSheetDcf } from "./engine";

const YI = 1e8;
const riskFree: PrefillLibrary["riskFree"] = {
  cn: { value: 1.65, date: "2026-10-19", label: "中国10年期国债" },
  us: { value: 4.2, date: "2026-10-16", label: "美国10年期国债" },
};
// 贵州茅台 2021–2025 年报原值（亿元）
const moutai: PrefillItem = {
  m: "cn", c: "600519", n: "贵州茅台", g: ["沪深300"], px: 1324.97, pxDate: "2026-10-19", ccy: "CNY", fy: "2025-12-31",
  years: [["2025", 1688 * YI, 615 * YI, 31 * YI], ["2024", 1709 * YI, 925 * YI, 47 * YI], ["2023", 1477 * YI, 666 * YI, 26 * YI], ["2022", 1241 * YI, 367 * YI, 53 * YI], ["2021", 1062 * YI, 640 * YI, 34 * YI]],
  cash: 516.9 * YI, inv: 88.7 * YI, debt: 2.3 * YI, shares: 12.5 * YI, interest: 0.3 * YI, pretax: 1147.6 * YI, tax: 294.4 * YI, ebitda: 1170.7 * YI, ni: 823.2 * YI,
  beta: 0.9, betaRaw: 0.85, betaWeeks: 104, src: "https://example.com", at: "2026-10-20",
};

describe("DCF 自动预填", () => {
  it("非金融公司现金与投资都未取到时标为数据不全，不静默当成 0", () => {
    const fill = deriveAutoFill({ ...moutai, cash: null, inv: null }, riskFree);
    expect(fill.status).toBe("incomplete");
    expect(fill.statusText).toContain("现金");
    expect(fill.values.cash).toBeUndefined();
  });
  it("有息负债为 0 但有利息支出时只加提示，数值与状态保持原样", () => {
    const fill = deriveAutoFill({ ...moutai, debt: 0, interest: 1 * YI }, riskFree);
    expect(fill.status).toBe("ok");
    expect(fill.values.debt).toBe("0");
    expect(fill.notes.some(n => n.includes("有息负债为 0") && n.includes("核对"))).toBe(true);
  });
  it("有息负债为 0 且无利息支出时不加提示", () => {
    const fill = deriveAutoFill({ ...moutai, debt: 0, interest: 0 }, riskFree);
    expect(fill.notes.some(n => n.includes("有息负债为 0"))).toBe(false);
  });
  it("近3年平均自由现金流、营收增速与 WACC 都附来源，且能直接算出合理价", () => {
    const fill = deriveAutoFill(moutai, riskFree);
    expect(fill.status).toBe("ok");
    expect(fill.values.baseFcf).toBe(String(Number((((615 - 31) + (925 - 47) + (666 - 26)) / 3).toFixed(1))));
    expect(fill.sources.baseFcf).toContain("近3年平均（2023–2025年报");
    expect(fill.values.growth).toBe("12.5"); // (1688/1062)^(1/4)-1 ≈ 12.3%，按 0.5 步长取整
    expect(fill.values.debt).toBe("2.3");
    expect(fill.sources.debt).toContain("不含应付账款");
    expect(fill.values.cash).toBe("579"); // 516.9 + 88.7×70%
    expect(fill.values.fadeYears).toBe("5");
    expect(fill.values.minority).toBe("0");
    const r = Number(fill.values.discountRate);
    expect(r).toBeGreaterThanOrEqual(7);
    expect(r).toBeLessThanOrEqual(12);
    const n = (k: keyof typeof fill.values) => (fill.values[k] == null ? null : Number(fill.values[k]));
    const result = calculateSheetDcf({ company: "茅台", code: "600519", market: "cn", currency: "CNY", moneyUnit: "yi", shareUnit: "yi", baseYear: 2025,
      baseFcf: n("baseFcf"), growth: n("growth"), perpetualGrowth: n("perpetualGrowth"), discountRate: n("discountRate"), cash: n("cash"), debt: n("debt"),
      shares: n("shares"), currentPrice: n("currentPrice"), ebitda: n("ebitda"), marketCap: n("marketCap"), beta: n("beta"), interestExpense: n("interestExpense"),
      pretaxIncome: n("pretaxIncome"), taxPaid: n("taxPaid"), riskFreeRate: n("riskFreeRate"), marketReturn: n("marketReturn") });
    expect(result.status).toBe("calculated");
    expect(result.price).toBeGreaterThan(500);
  });
  it("增速封顶15%、下滑按0%，WACC 夹在 7%～12%", () => {
    const fast = deriveAutoFill({ ...moutai, years: [["2025", 300 * YI, 50 * YI, 5 * YI], ["2024", 200 * YI, 40 * YI, 5 * YI], ["2023", 100 * YI, 30 * YI, 5 * YI]] }, riskFree);
    expect(fast.values.growth).toBe("15");
    expect(fast.sources.growth).toContain("按上限 15%");
    const shrinking = deriveAutoFill({ ...moutai, years: [["2025", 80 * YI, 50 * YI, 5 * YI], ["2024", 90 * YI, 40 * YI, 5 * YI], ["2023", 100 * YI, 30 * YI, 5 * YI]] }, riskFree);
    expect(shrinking.values.growth).toBe("0");
    expect(deriveAutoFill({ ...moutai, beta: 0.3 }, riskFree).values.discountRate).toBe("8");
    expect(deriveAutoFill({ ...moutai, beta: 0.3 }, riskFree).sources.discountRate).toContain("合理区间");
  });
  it("未披露利息支出时按无风险利率+2%估算负债成本", () => {
    const fill = deriveAutoFill({ ...moutai, m: "us", ccy: "USD", interest: null, debt: 100 * YI }, riskFree);
    expect(fill.values.interestExpense).toBe(String(Number((100 * 0.062).toFixed(2))));
    expect(fill.sources.interestExpense).toContain("+ 2% 估算");
    expect(fill.sources.riskFreeRate).toContain("美国10年期国债");
  });
  it("金融企业、负现金流、数据不全分别说明不适用原因", () => {
    expect(deriveAutoFill({ ...moutai, fin: true, org: "银行" }, riskFree).statusText).toContain("银行企业");
    expect(deriveAutoFill({ ...moutai, years: moutai.years.map(([y, r]) => [y, r, 10 * YI, 20 * YI]) }, riskFree).status).toBe("negativeFcf");
    expect(deriveAutoFill({ ...moutai, shares: null }, riskFree).status).toBe("incomplete");
  });
  it("汇率折算写进说明", () => {
    expect(deriveAutoFill({ ...moutai, m: "hk", ccy: "HKD", fx: { from: "CNY", rate: 1.0874, date: "2026-10-17" } }, riskFree).notes[0]).toContain("CNY");
  });
  it("搜索：代码精确优先，忽略港股前导零与市场前缀", () => {
    const items = [moutai, { ...moutai, m: "hk", c: "00700", n: "腾讯控股" }, { ...moutai, m: "us", c: "AAPL", n: "苹果" }] as PrefillItem[];
    expect(searchPrefill(items, "700")[0].n).toBe("腾讯控股");
    expect(searchPrefill(items, "sh600519")[0].n).toBe("贵州茅台");
    expect(searchPrefill(items, "茅台")[0].c).toBe("600519");
    expect(searchPrefill(items, "aapl")[0].n).toBe("苹果");
    expect(searchPrefill(items, "不存在")).toEqual([]);
  });
  it("反向 DCF：求出的成长率代回去恰好等于现价", () => {
    const input = { company: "x", code: "x", market: "cn" as const, currency: "CNY" as const, moneyUnit: "yi" as const, shareUnit: "yi" as const, baseYear: 2025,
      baseFcf: 100, growth: 5, perpetualGrowth: 2.5, discountRate: 9, cash: 0, debt: 0, shares: 10, currentPrice: 150, ebitda: null,
      marketCap: null, beta: null, interestExpense: null, pretaxIncome: null, taxPaid: null, riskFreeRate: null, marketReturn: null };
    const g = impliedGrowth(input)!;
    expect(Math.abs(calculateSheetDcf({ ...input, growth: g }).price! - 150)).toBeLessThan(1);
    expect(impliedGrowth({ ...input, currentPrice: 1e6 })).toBeNull();
    expect(impliedGrowth({ ...input, currentPrice: null })).toBeNull();
  });
  it("美股自由现金流扣股权激励；扩张期提供维持性资本开支口径；少数股东权益照扣", () => {
    const amzn: PrefillItem = { ...moutai, m: "us", ccy: "USD", mi: 5 * YI,
      years: [["2025", 7000 * YI, 1400 * YI, 1300 * YI, 600 * YI, 200 * YI], ["2024", 6300 * YI, 1150 * YI, 800 * YI, 500 * YI, 220 * YI], ["2023", 5700 * YI, 850 * YI, 500 * YI, 480 * YI, 240 * YI]] };
    const fill = deriveAutoFill(amzn, riskFree);
    expect(fill.values.baseFcf).toBe("46.67"); // (−100 + 130 + 110) / 3
    expect(fill.sources.baseFcf).toContain("已扣股权激励");
    expect(fill.values.minority).toBe("5");
    const alt = fill.alternatives[0];
    expect(alt.field).toBe("baseFcf");
    expect(Number(alt.value)).toBeCloseTo(((1400 - 600 - 200) + (1150 - 500 - 220) + (850 - 480 - 240)) / 3, 1);
    expect(alt.reason).toContain("扩张投入期");
    expect(deriveAutoFill(moutai, riskFree).alternatives).toEqual([]);
  });
});
