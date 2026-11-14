// 预填库里每家公司按默认假设算出的 DCF 摘要，供公司列表、候选池显示与筛选。
// 与 DCF 页“一键估算”用同一套规则（deriveAutoFill + assess），列表里看到的数和点进去的一致。
import { deriveAutoFill, type AutoStatus, type PrefillLibrary } from "./autofill.ts";
import { assess, type Credibility } from "./assessment.ts";
import { calculateSheetDcf } from "./engine.ts";
import type { DcfSheetInput } from "./types.ts";
import { AUTO_STATUS, autoDcfKey, parseAutoSummary, type AutoDcf, type AutoSummaryCredibility, type AutoSummaryStatus, type SummaryRow } from "./autoDcfSummary.ts";
export { autoDcfKey, parseAutoSummary, type AutoDcf };

// 摘要模块不依赖估值引擎（服务端也要用），这里在编译期保证两边的取值一致
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type AutoSummaryInSync = [Same<AutoStatus, AutoSummaryStatus>, Same<Credibility, AutoSummaryCredibility>] extends [true, true] ? true : never;
export const autoSummaryInSync: AutoSummaryInSync = true;

export function buildAutoDcf(lib: PrefillLibrary): Map<string, AutoDcf> {
  const out = new Map<string, AutoDcf>();
  for (const item of lib.items) {
    const fill = deriveAutoFill(item, lib.riskFree);
    const n = (k: keyof typeof fill.values) => (fill.values[k] == null || fill.values[k] === "" ? null : Number(fill.values[k]));
    const input: DcfSheetInput = {
      company: item.n, code: item.c, market: item.m, currency: item.ccy, moneyUnit: "yi", shareUnit: "yi", baseYear: Number(fill.meta.baseYear),
      baseFcf: n("baseFcf"), growth: n("growth"), perpetualGrowth: n("perpetualGrowth"), discountRate: n("discountRate"), cash: n("cash"), debt: n("debt"),
      shares: n("shares"), currentPrice: n("currentPrice"), ebitda: n("ebitda"), marketCap: n("marketCap"), beta: n("beta"), interestExpense: n("interestExpense"),
      pretaxIncome: n("pretaxIncome"), taxPaid: n("taxPaid"), riskFreeRate: n("riskFreeRate"), marketReturn: n("marketReturn"), fadeYears: n("fadeYears"), minority: n("minority"),
    };
    const ok = fill.status === "ok" && calculateSheetDcf(input).status === "calculated";
    const a = ok ? assess(input, item, null) : null;
    out.set(autoDcfKey(item.m, item.c), {
      status: ok ? "ok" : fill.status === "ok" ? "incomplete" : fill.status,
      fair: a?.scenarios[1].price ?? null, buyBelow: a?.buyBelow ?? null, credibility: a?.credibility ?? null,
      current: item.px, currency: item.ccy, priceDate: item.pxDate || null, ...(item.pxLive ? { priceLive: true } : {}),
    });
  }
  return out;
}

/** 编码为紧凑摘要：{ "cn:600519": [状态, 合理价, 买入参考价, 可信度, 现价, 币种, 现价日期, 是否盘中价] }；后两列为后加，解析时可缺 */
export function encodeAutoSummary(map: Map<string, AutoDcf>, generatedAt: string): { schemaVersion: 1; generatedAt: string; items: Record<string, SummaryRow> } {
  const r = (v: number | null) => (v == null ? null : Number(v.toPrecision(6)));
  const items: Record<string, SummaryRow> = {};
  for (const [key, a] of map) items[key] = [AUTO_STATUS.indexOf(a.status), r(a.fair), r(a.buyBelow), a.credibility ? a.credibility[0] : null, a.current, a.currency, a.priceDate ?? null, a.priceLive ? 1 : 0];
  return { schemaVersion: 1, generatedAt, items };
}

let pending: Promise<Map<string, AutoDcf>> | null = null;
/** 全站共用一次加载：优先用约 30KB 的预算摘要，缺失时退回下载整个预填库现算；都失败返回空表，不影响页面其他内容 */
export function loadAutoDcf(fetchImpl: typeof fetch = fetch): Promise<Map<string, AutoDcf>> {
  if (!pending) {
    const base = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? "/";
    const get = (name: string) => fetchImpl(`${base}data/${name}`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    pending = get("dcf-auto.json")
      .then((body) => parseAutoSummary(body) ?? Promise.reject(new Error("bad summary")))
      .catch(() => get("dcf-prefill.json").then((lib: PrefillLibrary) => (lib?.schemaVersion === 1 && Array.isArray(lib.items) ? buildAutoDcf(lib) : new Map())))
      .catch(() => { pending = null; return new Map<string, AutoDcf>(); });
  }
  return pending;
}
/** 仅测试用 */
export function resetAutoDcf(): void { pending = null; }
