// 预填库里每家公司按默认假设算出的 DCF 摘要，供公司列表、候选池显示与筛选。
// 与 DCF 页“一键估算”用同一套规则（deriveAutoFill + assess），列表里看到的数和点进去的一致。
import { deriveAutoFill, type AutoStatus, type PrefillLibrary } from "./autofill.ts";
import { assess, type Credibility } from "./assessment.ts";
import { calculateSheetDcf } from "./engine.ts";
import type { DcfSheetInput } from "./types.ts";

export interface AutoDcf {
  status: AutoStatus;
  /** 基准合理价；不适用或数据不全时为 null */
  fair: number | null;
  buyBelow: number | null;
  credibility: Credibility | null;
  /** 预填库里的最新股价 */
  current: number;
  currency: string;
}

export const autoDcfKey = (venue: "cn" | "hk" | "us", code: string): string => `${venue}:${code.toUpperCase()}`;

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
      current: item.px, currency: item.ccy,
    });
  }
  return out;
}

const STATUS: AutoStatus[] = ["ok", "financial", "negativeFcf", "incomplete"];
const CRED: Record<string, Credibility> = { h: "high", m: "medium", l: "low" };
type SummaryRow = [number, number | null, number | null, string | null, number, string];
/** 编码为紧凑摘要：{ "cn:600519": [状态, 合理价, 买入参考价, 可信度, 现价, 币种] } */
export function encodeAutoSummary(map: Map<string, AutoDcf>, generatedAt: string): { schemaVersion: 1; generatedAt: string; items: Record<string, SummaryRow> } {
  const r = (v: number | null) => (v == null ? null : Number(v.toPrecision(6)));
  const items: Record<string, SummaryRow> = {};
  for (const [key, a] of map) items[key] = [STATUS.indexOf(a.status), r(a.fair), r(a.buyBelow), a.credibility ? a.credibility[0] : null, a.current, a.currency];
  return { schemaVersion: 1, generatedAt, items };
}
/** 解析云端预先算好的摘要（scripts/dcf-prefill.mjs → public/data/dcf-auto.json） */
export function parseAutoSummary(body: unknown): Map<string, AutoDcf> | null {
  const items = (body as { schemaVersion?: number; items?: Record<string, SummaryRow> })?.items;
  if ((body as { schemaVersion?: number })?.schemaVersion !== 1 || !items || typeof items !== "object") return null;
  const out = new Map<string, AutoDcf>();
  for (const [key, [s, fair, buyBelow, cred, current, currency]] of Object.entries(items))
    if (STATUS[s] && Number.isFinite(current)) out.set(key, { status: STATUS[s], fair, buyBelow, credibility: cred ? CRED[cred] ?? null : null, current, currency });
  return out;
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
