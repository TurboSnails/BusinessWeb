// 把一次 DCF 结果翻译成初中级投资者能直接用的判断：三情景、可信度、买入参考价、一句话结论。
// 全部是确定性规则，不预测走势；阈值写在这里，页面和测试共用。
import { calculateSheetDcf } from "./engine.ts";
import type { DcfSheetInput } from "./types.ts";
import type { PrefillItem } from "./autofill.ts";

export interface Scenario { key: "bear" | "base" | "bull"; label: string; growth: number; discountRate: number; price: number | null }
export type Credibility = "high" | "medium" | "low";
export interface Assessment {
  scenarios: Scenario[];
  credibility: Credibility;
  credibilityReasons: string[];
  /** 该可信度下要求的安全边际（0~1） */
  requiredMargin: number;
  /** 基准合理价打折后的买入参考价；算不出时为 null */
  buyBelow: number | null;
  verdict: string;
  tone: "good" | "neutral" | "caution";
}

export const ASSESSMENT_RULES = {
  bear: { growthFactor: 0.5, discountShift: 1 },
  bull: { growthFactor: 1.5, maxGrowthAdd: 5, discountShift: -1 },
  margin: { high: 0.2, medium: 0.3, low: 0.4 } as Record<Credibility, number>,
  /** 自由现金流波动（变异系数）超过此值视为不稳定 */
  volatileCv: 0.5,
  terminalShareHigh: 0.8,
  /** 合理价 / 现价超过此倍数视为异常，可信度降为低 */
  outlierMultiple: 3,
} as const;

/** 悲观：增速减半、折现率 +1%；乐观：增速 ×1.5（最多 +5 个百分点）、折现率 −1%（且高于永续增长 1% 以上） */
export function scenarios(input: DcfSheetInput): Scenario[] {
  const g = input.growth ?? 0, r = input.discountRate ?? 0, gp = input.perpetualGrowth ?? 0;
  const { bear, bull } = ASSESSMENT_RULES;
  const make = (key: Scenario["key"], label: string, growth: number, discountRate: number): Scenario => {
    const res = calculateSheetDcf({ ...input, growth, discountRate });
    return { key, label, growth, discountRate, price: res.status === "calculated" ? res.price : null };
  };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return [
    make("bear", "悲观", round1(g > 0 ? g * bear.growthFactor : g - 2), round1(r + bear.discountShift)),
    make("base", "基准", g, r),
    make("bull", "乐观", round1(g > 0 ? Math.min(g * bull.growthFactor, g + bull.maxGrowthAdd) : g + 2), round1(Math.max(r + bull.discountShift, gp + 1))),
  ];
}

/** 可信度：看现金流是否持续为正、是否稳定、终值占比，以及数据是否完整 */
export function credibility(item: PrefillItem | null, terminalShare: number | undefined): { level: Credibility; reasons: string[] } {
  const reasons: string[] = [];
  let level: Credibility = "high";
  const down = (to: Credibility, why: string) => { reasons.push(why); if (to === "low" || level === "high") level = to; };
  if (item) {
    const fcf = item.years.filter(y => y[2] != null && y[3] != null).map(y => y[2]! - y[3]! - (y[5] ?? 0));
    if (fcf.length < 3) down("medium", `只有 ${fcf.length} 年完整现金流数据`);
    const negatives = fcf.filter(v => v <= 0).length;
    if (negatives) down("low", `近 ${fcf.length} 年中有 ${negatives} 年自由现金流为负`);
    else if (fcf.length >= 3) {
      const mean = fcf.reduce((a, v) => a + v, 0) / fcf.length;
      const cv = Math.sqrt(fcf.reduce((a, v) => a + (v - mean) ** 2, 0) / fcf.length) / mean;
      if (cv > ASSESSMENT_RULES.volatileCv) down("medium", `自由现金流年际波动大（变异系数 ${cv.toFixed(2)}）`);
      else reasons.push(`近 ${fcf.length} 年自由现金流均为正且较稳定`);
    }
  } else down("medium", "假设为手动填写，未与财报核对");
  if (terminalShare != null && terminalShare > ASSESSMENT_RULES.terminalShareHigh)
    down("medium", `终值占企业价值 ${(terminalShare * 100).toFixed(0)}%，结果主要取决于远期假设`);
  return { level, reasons };
}

export function assess(input: DcfSheetInput, item: PrefillItem | null, impliedGrowth: number | null): Assessment | null {
  const base = calculateSheetDcf(input);
  if (base.status !== "calculated" || base.price == null) return null;
  const list = scenarios(input);
  const cred = credibility(item, base.terminalShare);
  let level = cred.level;
  const reasons = [...cred.reasons];
  // 合理价远超现价时多半是口径问题（股本、现金、预收款推高的现金流），而不是真有几倍空间
  if (input.currentPrice && input.currentPrice > 0 && base.price / input.currentPrice > ASSESSMENT_RULES.outlierMultiple) {
    level = "low";
    reasons.push(`合理价超过现价 ${ASSESSMENT_RULES.outlierMultiple} 倍，常见原因是股本或现金口径、预收款推高的经营现金流，需人工核对`);
  }
  const requiredMargin = ASSESSMENT_RULES.margin[level];
  const buyBelow = base.price > 0 ? base.price * (1 - requiredMargin) : null;
  const price = input.currentPrice;
  const [bear, , bull] = list;
  let verdict: string, tone: Assessment["tone"];
  if (price == null || price <= 0) { verdict = "缺少现价，无法判断贵贱。"; tone = "neutral"; }
  else if (level === "low") {
    verdict = "现金流不稳定，DCF 结果仅供参考，建议结合市销率、行业周期等其他方法判断。"; tone = "caution";
  } else if (buyBelow != null && price <= buyBelow) {
    verdict = `现价低于买入参考价（已留 ${requiredMargin * 100}% 安全边际），${bear.price != null && price <= bear.price ? "甚至低于悲观情景，" : ""}值得深入研究。`; tone = "good";
  } else if (price <= base.price) {
    verdict = `现价低于基准合理价但安全边际不足 ${requiredMargin * 100}%，可列入观察，等更好的价格。`; tone = "neutral";
  } else if (bull.price != null && price <= bull.price) {
    verdict = `现价比基准合理价高约 ${Math.round((price / base.price - 1) * 100)}%，只有乐观情景能支撑，需要相信更高的增长。`; tone = "caution";
  } else {
    verdict = `现价高于乐观情景，按历史现金流难以支撑${impliedGrowth != null ? `，市场隐含未来五年增速约 ${impliedGrowth.toFixed(1)}%` : ""}。`; tone = "caution";
  }
  return { scenarios: list, credibility: level, credibilityReasons: reasons, requiredMargin, buyBelow, verdict, tone };
}

export const CREDIBILITY_LABEL: Record<Credibility, string> = { high: "高", medium: "中", low: "低" };
