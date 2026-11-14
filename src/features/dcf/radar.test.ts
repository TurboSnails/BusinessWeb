import { describe, expect, it } from "vitest";
import { buildRadar, radarLedgerMap, stressPeCeiling, type RadarLynch } from "./radar";
import type { AutoDcf } from "./autoDcf";
import type { PrefillItem } from "./autofill";

const YI = 1e8;
const item = (c: string, extra: Partial<PrefillItem> = {}): PrefillItem => ({
  m: "cn", c, n: c, g: ["沪深300"], px: 10, pxDate: "2026-11-13", ccy: "CNY", fy: "2025-12-31", ind: "食品饮料",
  years: [["2025", 100 * YI, 10 * YI, 1 * YI], ["2024", 95 * YI, 10 * YI, 1 * YI], ["2023", 90 * YI, 10 * YI, 1 * YI]],
  cash: 0, inv: 0, debt: 0, shares: 10 * YI, interest: 0, pretax: 0, tax: 0, ebitda: 0, ni: 0, beta: 1, betaRaw: 1, betaWeeks: 104, src: "", at: "", ...extra,
});
const dcf = (fair: number, extra: Partial<AutoDcf> = {}): AutoDcf => ({ status: "ok", fair, buyBelow: fair * 0.8, credibility: "high", current: 10, currency: "CNY", ...extra });
type Moat = NonNullable<RadarLynch["m"]>;
const moat = ({ label = "证据不足", persist = true as boolean | null, health = true as boolean | null } = {}): Moat => ({
  s: 3, n: 6, l: label,
  i: [["盈利持续", persist, "三个 TTM 窗口利润 12/11/10（要求全正、未萎缩、回撤 ≤30%）"], ["财务稳健", health, "资产负债率 40%，流动比率 1.5"]],
});
const ly = (t: string, extra: Partial<RadarLynch> = {}): RadarLynch => ({ t, pe: 12, g: 5, c: 5, rg: 4, ph: null, w: [], f: [], m: moat(), peAsOf: "2026-11-13", ...extra });
const hist = (pct: number) => ({ now: 8, pct, med: 6, lo: 3, hi: 10, n: 60 });

describe("机会雷达·价值回归", () => {
  // 周期顶点：旧规则下它安全边际最大、比历史与同行都便宜，会排第一
  const items = [
    item("PEAK", { fyh: hist(95) }), item("STEADY", { fyh: hist(80) }), item("SLOW", { fyh: hist(30) }),
    item("FLAGGED"), item("FALLING"), item("SHRINK"), item("BANK", { fin: true }), item("LOWCRED"), item("PRICEY"), item("NOPERSIST"),
  ];
  const auto = new Map<string, AutoDcf>([
    ["cn:PEAK", dcf(30)], ["cn:STEADY", dcf(16)], ["cn:SLOW", dcf(14, { credibility: "medium" })], ["cn:FLAGGED", dcf(20)], ["cn:FALLING", dcf(20)],
    ["cn:SHRINK", dcf(20)], ["cn:BANK", dcf(0, { status: "financial", fair: null, buyBelow: null, credibility: null })], ["cn:LOWCRED", dcf(20, { credibility: "low" })],
    ["cn:PRICEY", dcf(11)], ["cn:NOPERSIST", dcf(20)],
  ]);
  const lynch: Record<string, RadarLynch> = {
    "cn:PEAK": ly("周期型", { w: ["行业属强周期"], ph: "盈利高位", pe: 5 }),
    "cn:STEADY": ly("稳健型", { g: 12, c: 10 }),
    "cn:SLOW": ly("缓慢增长型"),
    "cn:FLAGGED": ly("缓慢增长型", { f: ["所属行业有周期属性（连续两年单边高增不等于脱离周期）"] }),
    "cn:FALLING": ly("缓慢增长型", { ph: "盈利下行" }),
    "cn:SHRINK": ly("缓慢增长型", { m: moat({ persist: false }) }),
    "cn:BANK": ly("缓慢增长型"),
    "cn:LOWCRED": ly("稳健型"),
    "cn:PRICEY": ly("稳健型"),
    "cn:NOPERSIST": ly("稳健型", { m: null }),
  };
  const r = buildRadar(items, auto, lynch);
  const reason = (c: string) => [...r.excluded, ...r.side].find((e) => e.item.c === c)?.reason ?? "";

  it("周期顶点不进价值回归：周期型移到「不在主线」，带周期标记的缓慢增长型也排除", () => {
    expect(r.value.map((x) => x.item.c)).not.toContain("PEAK");
    expect(r.side.find((e) => e.item.c === "PEAK")?.group).toBe("cyclical");
    expect(reason("FLAGGED")).toMatch(/强周期/);
    expect(reason("FALLING")).toMatch(/盈利下行/);
  });

  it("只收正常盈利可查、低于买入参考价、可信度不为低的稳健/缓慢增长型", () => {
    expect(r.value.map((x) => x.item.c)).toEqual(["STEADY", "SLOW"]);
    expect(reason("SHRINK")).toMatch(/萎缩或回撤/);
    expect(reason("NOPERSIST")).toMatch(/缺三个 TTM/);
    expect(reason("BANK")).toMatch(/金融业/);
    expect(reason("LOWCRED")).toMatch(/可信度低/);
    expect(reason("PRICEY")).toMatch(/高于 DCF 买入参考价/);
  });

  it("历史估值带计分：FCF 收益率分位 ≥60% 才加分", () => {
    const [steady, slow] = r.value;
    expect(steady.checks.find((c) => c.id === "history")).toMatchObject({ pass: true, points: 1 });
    expect(slow.checks.find((c) => c.id === "history")).toMatchObject({ pass: false, points: 0 });
    expect(steady.headroom).toBeCloseTo(0.6);
    expect(steady.dates).toMatchObject({ price: "2026-11-13", fy: "2025-12-31" });
  });
});

describe("机会雷达·快速增长", () => {
  const items = ["FAST", "DEAR", "SLOWING", "NOC", "BROKER", "HOT", "CYC", "OVERRIDE", "DILUTE"].map((c) => item(c, c === "BROKER" ? { fin: true } : c === "DILUTE" ? { m: "us" } : {}));
  const lynch: Record<string, RadarLynch> = {
    "cn:FAST": ly("快速增长型", { g: 30, c: 28, rg: 25, pe: 20 }),
    "cn:DEAR": ly("快速增长型", { g: 30, c: 28, rg: 25, pe: 40 }),
    "cn:SLOWING": ly("快速增长型", { g: 22, c: 40, rg: 20, pe: 15, f: ["近一年增速较两年年化明显放缓"] }),
    "cn:NOC": ly("快速增长型", { g: 40, c: null, rg: 30, pe: 15 }),
    "cn:BROKER": ly("快速增长型", { g: 60, c: 45, rg: 50, pe: 8 }),
    "cn:HOT": ly("快速增长型", { g: 150, c: 120, rg: 30, pe: 30, f: ["增速 >80% 多来自低基数或一次性因素，PEG 偏乐观，评级下调一档"] }),
    "cn:CYC": ly("快速增长型", { g: 40, c: 35, rg: 30, pe: 10, f: ["所属行业有周期属性（连续两年单边高增不等于脱离周期）"] }),
    "cn:OVERRIDE": ly("快速增长型", { g: 40, c: 35, rg: 30, pe: 10, f: ["所属行业有周期属性（连续两年单边高增不等于脱离周期）"], cyclical: false }),
    "us:DILUTE": ly("快速增长型", { g: 30, c: 30, rg: 25, pe: 18, f: ["隐含股本在近 5 个季度变动 >25%（增发/并购/回购）"], inputSource: "x.json", inputWindows: ["2026-09-30"] }),
  };
  const r = buildRadar(items, new Map(), lynch);
  const row = (c: string) => r.growth.find((x) => x.item.c === c);
  const reason = (c: string) => r.excluded.find((e) => e.item.c === c)?.reason ?? "";

  it("PE 压力条件：(1+g)³÷1.1³×15，增速按 50% 封顶", () => {
    expect(stressPeCeiling(20)).toBeCloseTo((1.2 / 1.1) ** 3 * 15);
    expect(stressPeCeiling(120)).toBeCloseTo(stressPeCeiling(50));
    expect(stressPeCeiling(50)).toBeCloseTo(38.03, 1);
  });

  it("收录增速持续、价格条件满足的快速增长型（不需要自动 DCF）", () => {
    expect(row("FAST")?.gates.map((g) => g.id)).toEqual(["sustained", "price"]);
    expect(row("FAST")?.checks.find((c) => c.id === "bridge")?.pass).toBe(true);
    expect(row("OVERRIDE")).toBeTruthy(); // 人工复核取消强周期 → 不按周期排除
  });

  it("排除并写明原因：价格过高、明显放缓、缺两年年化、金融业、未复核的周期标记", () => {
    expect(reason("DEAR")).toMatch(/PE 40\.0× 高于压力上限/);
    expect(reason("SLOWING")).toMatch(/明显放缓/);
    expect(reason("NOC")).toMatch(/两年年化/);
    expect(reason("BROKER")).toMatch(/金融业/);
    expect(reason("CYC")).toMatch(/强周期/);
  });

  it("增速 >80% 进榜但标为低基数待核、不计分；股本大幅变动扣分；按新财报重算的增速可信度更高", () => {
    expect(row("HOT")?.checks.find((c) => c.id === "extrapolate")).toMatchObject({ pass: false, points: 0 });
    expect(row("HOT")?.checks.find((c) => c.id === "extrapolate")?.detail).toMatch(/低基数/);
    const d = row("DILUTE")!;
    expect(d.checks.find((c) => c.id === "dilution")).toMatchObject({ pass: false, points: -1 });
    expect(d.credRank).toBe(0);
    expect(d.dates.growth).toMatch(/2026-09-30/);
    expect(row("FAST")?.dates.growth).toMatch(/核验日期缺失/);
  });
});

describe("机会雷达·巴菲特加减分与排序", () => {
  const items = ["WIDE", "PLAIN", "WEAK", "MED"].map((c) => item(c));
  const auto = new Map<string, AutoDcf>([["cn:WIDE", dcf(14)], ["cn:PLAIN", dcf(20)], ["cn:WEAK", dcf(20)], ["cn:MED", dcf(14, { credibility: "medium" })]]);
  const lynch: Record<string, RadarLynch> = {
    "cn:WIDE": ly("稳健型", { m: moat({ label: "宽护城河迹象" }) }),
    "cn:PLAIN": ly("稳健型"),
    "cn:WEAK": ly("稳健型", { m: moat({ health: false }) }),
    "cn:MED": ly("稳健型", { m: moat({ label: "宽护城河迹象" }) }),
  };
  const r = buildRadar(items, auto, lynch);

  it("宽护城河 +1、财务稳健 +0.5 / 未通过 −1；同分先按可信度", () => {
    expect(r.value.map((x) => [x.item.c, x.score])).toEqual([["WIDE", 1.5], ["MED", 1.5], ["PLAIN", 0.5], ["WEAK", -1]]);
  });

  it("台账编码：价值回归 1、快速增长 2", () => {
    const g = buildRadar([item("G")], new Map(), { "cn:G": ly("快速增长型", { g: 30, c: 30, rg: 25, pe: 15 }) });
    expect([...radarLedgerMap(r).values()]).toEqual([1, 1, 1, 1]);
    expect(radarLedgerMap(g).get("cn:G")).toBe(2);
  });

  it("没有林奇分类的公司排除并写明原因", () => {
    const x = buildRadar([item("NONE")], new Map(), {});
    expect(x.side[0]).toMatchObject({ group: "nodata", reason: expect.stringMatching(/没有林奇分类/) });
  });
});
