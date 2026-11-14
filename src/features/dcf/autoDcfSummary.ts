// 自动 DCF 预算摘要（public/data/dcf-auto.json）的格式与解析：纯函数、无依赖，
// 站内（autoDcf.ts → 公司列表、候选池）与服务端每日提醒邮件共用同一份解析规则。
// 状态与可信度的取值和 autofill.ts / assessment.ts 一致（autoDcf.ts 里有编译期检查）。
export type AutoSummaryStatus = "ok" | "financial" | "negativeFcf" | "incomplete";
export type AutoSummaryCredibility = "high" | "medium" | "low";

export interface AutoDcf {
  status: AutoSummaryStatus;
  /** 基准合理价；不适用或数据不全时为 null */
  fair: number | null;
  buyBelow: number | null;
  credibility: AutoSummaryCredibility | null;
  /** 预填库里的最新股价 */
  current: number;
  currency: string;
  /** 现价的行情日期（YYYY-MM-DD）；旧版摘要没有这一列 */
  priceDate?: string | null;
  /** 现价是收盘前的盘中报价（不是收盘价） */
  priceLive?: boolean;
}

export const autoDcfKey = (venue: "cn" | "hk" | "us", code: string): string => `${venue}:${code.toUpperCase()}`;

export const AUTO_STATUS: readonly AutoSummaryStatus[] = ["ok", "financial", "negativeFcf", "incomplete"];
const CRED: Record<string, AutoSummaryCredibility> = { h: "high", m: "medium", l: "low" };
export type SummaryRow = [number, number | null, number | null, string | null, number, string, (string | null)?, (1 | 0)?];

/** 解析云端预先算好的摘要（scripts/dcf-prefill.mjs → public/data/dcf-auto.json） */
export function parseAutoSummary(body: unknown): Map<string, AutoDcf> | null {
  const items = (body as { schemaVersion?: number; items?: Record<string, SummaryRow> })?.items;
  if ((body as { schemaVersion?: number })?.schemaVersion !== 1 || !items || typeof items !== "object") return null;
  const out = new Map<string, AutoDcf>();
  for (const [key, [s, fair, buyBelow, cred, current, currency, priceDate, live]] of Object.entries(items))
    if (AUTO_STATUS[s] && Number.isFinite(current)) out.set(key, {
      status: AUTO_STATUS[s], fair, buyBelow, credibility: cred ? CRED[cred] ?? null : null, current, currency,
      priceDate: typeof priceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(priceDate) ? priceDate : null, ...(live === 1 ? { priceLive: true } : {}),
    });
  return out;
}
