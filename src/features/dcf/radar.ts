// 机会雷达：在预填库里找“估值信号共振”的公司。规则固定、可复核，只做研究短名单，不是买卖建议。
// 必要条件：自动 DCF 可用、可信度不为低、现价低于买入参考价。
// 加分信号：比自身近5年大多数时候便宜（FCF 收益率分位 ≥60%）；自由现金流收益率不低于同行中位。
import { autoDcfKey, type AutoDcf } from "./autoDcf.ts";
import type { PrefillItem } from "./autofill.ts";
import { peerStats, type PeerStats } from "./peers.ts";

export const RADAR_RULES = { historyPct: 60 } as const;

export interface RadarRow {
  item: PrefillItem;
  dcf: AutoDcf;
  mos: number;
  history: number | null;
  peers: PeerStats | null;
  cheapVsHistory: boolean;
  cheapVsPeers: boolean;
  /** 加分信号个数（0–2） */
  score: number;
}

export function radarRows(items: PrefillItem[], auto: Map<string, AutoDcf>): RadarRow[] {
  const rows: RadarRow[] = [];
  for (const item of items) {
    const dcf = auto.get(autoDcfKey(item.m, item.c));
    if (!dcf || dcf.status !== "ok" || dcf.fair == null || dcf.buyBelow == null || dcf.credibility === "low") continue;
    if (!(dcf.current <= dcf.buyBelow)) continue;
    const history = item.fyh?.pct ?? null;
    const peers = peerStats(items, item);
    const cheapVsHistory = history != null && history >= RADAR_RULES.historyPct;
    const cheapVsPeers = !!peers && peers.self.fcfYield >= peers.medianYield;
    rows.push({ item, dcf, mos: dcf.fair / dcf.current - 1, history, peers, cheapVsHistory, cheapVsPeers, score: Number(cheapVsHistory) + Number(cheapVsPeers) });
  }
  // 信号多的在前；同分按可信度、再按安全边际
  const cred = (r: RadarRow) => (r.dcf.credibility === "high" ? 0 : 1);
  return rows.sort((a, b) => b.score - a.score || cred(a) - cred(b) || b.mos - a.mos);
}
