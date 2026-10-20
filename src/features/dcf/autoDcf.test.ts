import { describe, expect, it } from "vitest";
import { buildAutoDcf, autoDcfKey, encodeAutoSummary, parseAutoSummary } from "./autoDcf";
import { dcfOf } from "../candidates/links";
import { matchDcfFilter } from "./filter";
import type { PrefillItem, PrefillLibrary } from "./autofill";
import type { DcfRecord } from "./types";

const YI = 1e8;
const item = (c: string, extra: Partial<PrefillItem> = {}): PrefillItem => ({
  m: "cn", c, n: c, g: ["沪深300"], px: 100, pxDate: "2026-10-20", ccy: "CNY", fy: "2025-12-31",
  years: [["2025", 300 * YI, 120 * YI, 20 * YI], ["2024", 280 * YI, 110 * YI, 20 * YI], ["2023", 260 * YI, 100 * YI, 20 * YI]],
  cash: 50 * YI, inv: 0, debt: 0, shares: 10 * YI, interest: 0, pretax: 100 * YI, tax: 25 * YI, ebitda: 120 * YI, ni: 75 * YI,
  beta: 1, betaRaw: 1, betaWeeks: 104, src: "", at: "", ...extra,
});
const lib: PrefillLibrary = { schemaVersion: 1, generatedAt: "", universe: 3, issues: [],
  riskFree: { cn: { value: 1.65, date: null, label: "" }, us: { value: 4.2, date: null, label: "" } },
  items: [item("600001"), item("600002", { fin: true, org: "银行" }), item("600003", { px: 10000 })] };
const record = (code: string, price: number, mos: number) => ({ market: "cn", code, savedAt: "2026-10-01T00:00:00Z", input: { currency: "CNY" }, result: { price, mos } }) as unknown as DcfRecord;

describe("列表里的 DCF：本人优先、自动补位、按最新价", () => {
  const auto = buildAutoDcf(lib);
  const tools = { dcf: [record("600003", 12000, 0.5)], valuation: [], grid: [], auto };
  it("自动估值给出合理价、买入参考价；金融企业标为不适用", () => {
    const a = auto.get(autoDcfKey("cn", "600001"))!;
    expect(a.status).toBe("ok");
    expect(a.fair).toBeGreaterThan(0);
    expect(a.buyBelow).toBeCloseTo(a.fair! * 0.8, 6);
    expect(auto.get(autoDcfKey("cn", "600002"))).toMatchObject({ status: "financial", fair: null });
  });
  it("本人记录优先，安全边际按最新价重算而不是保存时的值", () => {
    const d = dcfOf("cn", "600003", tools)!;
    expect(d.source).toBe("mine");
    expect(d.mos).toBeCloseTo((12000 - 10000) / 10000, 10);
    expect(dcfOf("cn", "600001", tools)!.source).toBe("auto");
    expect(dcfOf("cn", "999999", tools)).toBeUndefined();
  });
  it("筛选：有估值 / 不适用 / 我算过的 / 低于买入参考价", () => {
    const fin = dcfOf("cn", "600002", tools);
    expect(matchDcfFilter("done", fin)).toBe(false);
    expect(matchDcfFilter("none", fin)).toBe(true);
    expect(matchDcfFilter("mine", dcfOf("cn", "600003", tools))).toBe(true);
    expect(matchDcfFilter("mine", dcfOf("cn", "600001", tools))).toBe(false);
    const cheap = { price: 200, mos: 1, current: 100, buyBelow: 160 };
    expect(matchDcfFilter("buy", cheap)).toBe(true);
    expect(matchDcfFilter("buy", { ...cheap, current: 170 })).toBe(false);
  });
  it("云端预算的摘要解析后与浏览器现算完全一致", async () => {
    const parsed = parseAutoSummary(JSON.parse(JSON.stringify(encodeAutoSummary(auto, "t"))))!;
    expect([...parsed.keys()].sort()).toEqual([...auto.keys()].sort());
    for (const [k, v] of auto) {
      const p = parsed.get(k)!;
      expect(p.status).toBe(v.status);
      expect(p.credibility).toBe(v.credibility);
      if (v.fair != null) expect(p.fair!).toBeCloseTo(v.fair, 3); else expect(p.fair).toBeNull();
    }
    expect(parseAutoSummary({ schemaVersion: 2, items: {} })).toBeNull();
  });
});
