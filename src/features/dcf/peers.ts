// 同行比较：同一市场、同一行业内，比较自由现金流收益率与营收增速。只用预填库里已有的原值。
import type { PrefillItem } from "./autofill.ts";

export interface PeerRow { code: string; name: string; market: PrefillItem["m"]; fcfYield: number; growth: number | null; self: boolean }
export interface PeerStats {
  industry: string; count: number; medianYield: number; medianGrowth: number | null
  /** 本公司收益率在同行中的名次（1 = 收益率最高，即最便宜） */
  rank: number; self: PeerRow; rows: PeerRow[]
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** 最近一年自由现金流（扣股权激励）÷ 市值；金融企业与数据不全的返回 null */
export function fcfYield(i: PrefillItem): number | null {
  const y = i.years.find((r) => r[2] != null && r[3] != null);
  if (i.fin || !y || !(i.shares && i.shares > 0) || !(i.px > 0)) return null;
  return ((y[2]! - y[3]! - (y[5] ?? 0)) / (i.px * i.shares)) * 100;
}
/** 近年营收复合增速（%），至少 3 年 */
export function revenueCagr(i: PrefillItem): number | null {
  const revs = i.years.filter((r) => r[1] != null && r[1] > 0);
  if (revs.length < 3) return null;
  const span = Number(revs[0][0]) - Number(revs[revs.length - 1][0]);
  return span > 0 ? ((revs[0][1]! / revs[revs.length - 1][1]!) ** (1 / span) - 1) * 100 : null;
}

export function peerStats(items: PrefillItem[], target: PrefillItem, minPeers = 4): PeerStats | null {
  if (!target.ind) return null;
  const rows: PeerRow[] = items
    .filter((i) => i.m === target.m && i.ind === target.ind)
    .map((i) => ({ code: i.c, name: i.n, market: i.m, fcfYield: fcfYield(i), growth: revenueCagr(i), self: i.c === target.c }))
    .filter((r): r is PeerRow => r.fcfYield != null)
    .sort((a, b) => b.fcfYield - a.fcfYield);
  const self = rows.find((r) => r.self);
  if (!self || rows.length < minPeers) return null;
  const growths = rows.map((r) => r.growth).filter((g): g is number => g != null);
  return {
    industry: target.ind, count: rows.length, medianYield: median(rows.map((r) => r.fcfYield)),
    medianGrowth: growths.length ? median(growths) : null, rank: rows.indexOf(self) + 1, self, rows,
  };
}
